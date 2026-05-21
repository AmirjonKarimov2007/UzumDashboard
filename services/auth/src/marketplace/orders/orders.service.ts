import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export interface OrdersQuery {
  storeId: string;
  page?: number;
  size?: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrders(query: OrdersQuery) {
    const { storeId, page = 0, size = 50, search, status, dateFrom, dateTo } = query;

    const where: any = { storeId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { uzumOrderId: { contains: search } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.orderedAt = {};
      if (dateFrom) where.orderedAt.gte = new Date(dateFrom);
      if (dateTo) where.orderedAt.lte = new Date(dateTo);
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: page * size,
        take: size,
        orderBy: { orderedAt: 'desc' },
        include: {
          items: {
            include: { product: { select: { name: true, imageUrl: true } } },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async getOrder(storeId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: {
          include: { product: { select: { name: true, imageUrl: true, price: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getOrderSummary(storeId: string) {
    const [total, statusCounts, financials] = await Promise.all([
      this.prisma.order.count({ where: { storeId } }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { storeId },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: { storeId, status: { notIn: ['CANCELED', 'RETURNED'] } },
        _sum: { total: true, profit: true, commission: true },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => (statusMap[s.status] = s._count.id));

    return {
      total,
      completed: statusMap['COMPLETED'] || 0,
      delivering: (statusMap['DELIVERING'] || 0) + (statusMap['PENDING_DELIVERY'] || 0),
      canceled: statusMap['CANCELED'] || 0,
      returned: statusMap['RETURNED'] || 0,
      totalRevenue: Number(financials._sum.total || 0),
      totalProfit: Number(financials._sum.profit || 0),
      totalCommission: Number(financials._sum.commission || 0),
    };
  }

  async getRecentOrders(storeId: string, limit = 10) {
    return this.prisma.order.findMany({
      where: { storeId },
      orderBy: { orderedAt: 'desc' },
      take: limit,
      include: {
        items: { select: { name: true, quantity: true, price: true } },
      },
    });
  }
}
