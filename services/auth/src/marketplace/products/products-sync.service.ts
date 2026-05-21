import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient, UzumProduct } from '../../uzum/client/uzum-api.client';

@Injectable()
export class ProductsSyncService {
  private readonly logger = new Logger(ProductsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
  ) {}

  async syncProducts(storeId: string, uzumShopId: string, apiKey: string): Promise<number> {
    this.logger.log(`Syncing products for store ${storeId}`);

    const uzumProducts = await this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId);

    if (!uzumProducts.length) {
      this.logger.log(`No products returned for store ${storeId}`);
      return 0;
    }

    let synced = 0;

    for (const p of uzumProducts) {
      const price = (p.sellPrice || p.fullPrice || 0) / 100;
      const purchasePrice = p.purchasePrice ? p.purchasePrice / 100 : null;
      const revenue = (p.revenue || 0) / 100;
      const margin = price > 0 && purchasePrice
        ? ((price - purchasePrice) / price) * 100
        : 0;
      const profit = purchasePrice
        ? (price - purchasePrice) * (p.ordersAmount || 0)
        : 0;

      await this.prisma.product.upsert({
        where: { storeId_uzumSkuId: { storeId, uzumSkuId: String(p.skuId) } },
        create: {
          storeId,
          uzumSkuId: String(p.skuId),
          uzumProductId: p.productId ? String(p.productId) : null,
          name: p.name || 'Unknown Product',
          category: p.categoryTitle || null,
          price,
          purchasePrice,
          stock: p.stocks || 0,
          soldCount: p.ordersAmount || 0,
          revenue,
          profit,
          margin,
          rating: p.rating || null,
          reviewCount: p.reviewsAmount || 0,
          viewCount: p.viewsAmount || 0,
          status: this.mapProductStatus(p.status),
          rank: p.productRank || null,
          imageUrl: p.imageUrls?.[0] || null,
        },
        update: {
          name: p.name || 'Unknown Product',
          category: p.categoryTitle || null,
          price,
          purchasePrice,
          stock: p.stocks || 0,
          soldCount: p.ordersAmount || 0,
          revenue,
          profit,
          margin,
          rating: p.rating || null,
          reviewCount: p.reviewsAmount || 0,
          viewCount: p.viewsAmount || 0,
          status: this.mapProductStatus(p.status),
          rank: p.productRank || null,
          imageUrl: p.imageUrls?.[0] || null,
          deletedAt: null,
        },
      });
      synced++;
    }

    this.logger.log(`Synced ${synced} products for store ${storeId}`);
    return synced;
  }

  private mapProductStatus(status: string): any {
    const map: Record<string, string> = {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      WARNING: 'WARNING',
      ARCHIVE: 'ARCHIVE',
      DEFECTED: 'DEFECTED',
    };
    return map[status?.toUpperCase()] || 'ACTIVE';
  }
}
