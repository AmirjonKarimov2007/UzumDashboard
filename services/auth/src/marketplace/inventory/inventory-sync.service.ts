import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { subDays } from 'date-fns';

@Injectable()
export class InventorySyncService {
  private readonly logger = new Logger(InventorySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
  ) {}

  async syncInventory(storeId: string, uzumShopId: string, apiKey: string): Promise<number> {
    this.logger.log(`Syncing inventory for store ${storeId}`);

    const stocks = await this.uzumClient.getAllStocks(storeId, apiKey, uzumShopId);

    if (!stocks.length) {
      // Still update computed fields for all products
      await this.updateInventoryComputedFields(storeId);
      return 0;
    }

    let synced = 0;
    for (const s of stocks) {
      const product = await this.prisma.product.findFirst({
        where: { storeId, uzumSkuId: String(s.skuId) },
      });
      if (!product) continue;

      const currentStock = s.stocks || 0;
      const reservedStock = s.reserved || 0;
      const soldLast30Days = await this.getSoldLast30Days(product.id);
      const daysUntilStockout = soldLast30Days > 0
        ? Math.floor((currentStock / soldLast30Days) * 30)
        : null;
      const status = this.computeInventoryStatus(currentStock, soldLast30Days);

      await this.prisma.inventory.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          storeId,
          currentStock,
          reservedStock,
          soldLast30Days,
          daysUntilStockout,
          status,
        },
        update: {
          currentStock,
          reservedStock,
          soldLast30Days,
          daysUntilStockout,
          status,
        },
      });

      // Keep product stock in sync
      await this.prisma.product.update({
        where: { id: product.id },
        data: { stock: currentStock },
      });

      synced++;
    }

    await this.updateInventoryComputedFields(storeId);
    this.logger.log(`Synced ${synced} inventory records for store ${storeId}`);
    return synced;
  }

  private async updateInventoryComputedFields(storeId: string): Promise<void> {
    // For products without stock data, create inventory entries based on product.stock
    const products = await this.prisma.product.findMany({
      where: { storeId, deletedAt: null, inventory: null },
    });

    for (const p of products) {
      const soldLast30Days = await this.getSoldLast30Days(p.id);
      const daysUntilStockout = soldLast30Days > 0
        ? Math.floor((p.stock / soldLast30Days) * 30)
        : null;
      const status = this.computeInventoryStatus(p.stock, soldLast30Days);

      await this.prisma.inventory.create({
        data: {
          productId: p.id,
          storeId,
          currentStock: p.stock,
          reservedStock: 0,
          soldLast30Days,
          daysUntilStockout,
          status,
        },
      });
    }
  }

  private async getSoldLast30Days(productId: string): Promise<number> {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const result = await this.prisma.orderItem.aggregate({
      where: {
        productId,
        order: {
          orderedAt: { gte: thirtyDaysAgo },
          status: { notIn: ['CANCELED', 'RETURNED'] },
        },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity || 0;
  }

  private computeInventoryStatus(stock: number, soldLast30Days: number): any {
    if (stock === 0) return 'OUT_OF_STOCK';
    if (soldLast30Days > 0 && stock < soldLast30Days * 0.3) return 'LOW_STOCK';
    if (soldLast30Days > 0 && stock > soldLast30Days * 6) return 'OVERSTOCK';
    return 'IN_STOCK';
  }
}
