import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export interface ProductsQuery {
  storeId: string;
  page?: number;
  size?: number;
  search?: string;
  status?: string;
  category?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProducts(query: ProductsQuery) {
    const { storeId, page = 0, size = 50, search, status, category, sortBy = 'revenue', order = 'desc' } = query;

    const where: any = { storeId, deletedAt: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    if (category) where.category = { contains: category, mode: 'insensitive' };

    const orderBy: any = {};
    const sortableFields = ['name', 'price', 'stock', 'soldCount', 'revenue', 'profit', 'margin', 'rating'];
    orderBy[sortableFields.includes(sortBy) ? sortBy : 'revenue'] = order;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: page * size,
        take: size,
        orderBy,
        include: { inventory: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async getProduct(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      include: {
        inventory: true,
        metrics: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getProductSummary(storeId: string) {
    const [total, active, lowStock, outOfStock] = await Promise.all([
      this.prisma.product.count({ where: { storeId, deletedAt: null } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.inventory.count({ where: { storeId, status: 'LOW_STOCK' } }),
      this.prisma.inventory.count({ where: { storeId, status: 'OUT_OF_STOCK' } }),
    ]);

    const revenue = await this.prisma.product.aggregate({
      where: { storeId, deletedAt: null },
      _sum: { revenue: true, profit: true, soldCount: true },
    });

    return {
      total,
      active,
      lowStock,
      outOfStock,
      totalRevenue: Number(revenue._sum.revenue || 0),
      totalProfit: Number(revenue._sum.profit || 0),
      totalSold: Number(revenue._sum.soldCount || 0),
    };
  }

  async getTopProducts(storeId: string, limit = 10) {
    return this.prisma.product.findMany({
      where: { storeId, deletedAt: null },
      orderBy: { revenue: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        revenue: true,
        soldCount: true,
        margin: true,
        status: true,
      },
    });
  }
}
