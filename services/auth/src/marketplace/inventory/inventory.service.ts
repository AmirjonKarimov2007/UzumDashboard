import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventory(storeId: string, page = 0, size = 50, status?: string, search?: string) {
    const where: any = { storeId };
    if (status) where.status = status;
    if (search) {
      where.product = { name: { contains: search, mode: 'insensitive' } };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip: page * size,
        take: size,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              price: true,
              category: true,
              uzumSkuId: true,
              status: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { currentStock: 'asc' }],
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return {
      data: items.map((i) => ({
        ...i,
        totalValue: Number(i.product.price) * i.currentStock,
        unitCost: Number(i.product.price),
      })),
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async getInventorySummary(storeId: string) {
    const [inStock, lowStock, outOfStock, overstock] = await Promise.all([
      this.prisma.inventory.count({ where: { storeId, status: 'IN_STOCK' } }),
      this.prisma.inventory.count({ where: { storeId, status: 'LOW_STOCK' } }),
      this.prisma.inventory.count({ where: { storeId, status: 'OUT_OF_STOCK' } }),
      this.prisma.inventory.count({ where: { storeId, status: 'OVERSTOCK' } }),
    ]);

    const totalValue = await this.prisma.$queryRaw<[{ total: number }]>`
      SELECT COALESCE(SUM(i.current_stock * p.price), 0) as total
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.store_id = ${storeId}
        AND p.deleted_at IS NULL
    `;

    return {
      inStock,
      lowStock,
      outOfStock,
      overstock,
      totalValue: Number(totalValue[0]?.total || 0),
    };
  }
}
