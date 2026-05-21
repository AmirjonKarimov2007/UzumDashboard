import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { subDays, subMonths, format, startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics(storeId: string, timeRange: string = 'month') {
    const { from, to, prevFrom, prevTo } = this.getDateRange(timeRange);

    const [current, previous] = await Promise.all([
      this.getMetricsForPeriod(storeId, from, to),
      this.getMetricsForPeriod(storeId, prevFrom, prevTo),
    ]);

    const calcChange = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : 0;

    return {
      revenue: {
        value: current.revenue,
        change: calcChange(current.revenue, previous.revenue),
        sparkline: await this.getSparkline(storeId, from, to, 'revenue'),
      },
      orders: {
        value: current.orders,
        change: calcChange(current.orders, previous.orders),
        sparkline: await this.getSparkline(storeId, from, to, 'orders'),
      },
      profit: {
        value: current.profit,
        change: calcChange(current.profit, previous.profit),
        sparkline: await this.getSparkline(storeId, from, to, 'profit'),
      },
      margin: {
        value: current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0,
        change: calcChange(
          current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0,
          previous.revenue > 0 ? (previous.profit / previous.revenue) * 100 : 0,
        ),
        sparkline: [],
      },
    };
  }

  async getRevenueChart(storeId: string, timeRange: string = 'month') {
    const { from, to } = this.getDateRange(timeRange);

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { storeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    return snapshots.map((s) => ({
      name: format(s.date, 'MMM d'),
      revenue: Number(s.revenue),
      profit: Number(s.profit),
      orders: s.orders,
    }));
  }

  async getCategoryBreakdown(storeId: string) {
    const products = await this.prisma.product.groupBy({
      by: ['category'],
      where: { storeId, deletedAt: null },
      _sum: { revenue: true },
      _count: { id: true },
    });

    const totalRevenue = products.reduce((sum, p) => sum + Number(p._sum.revenue || 0), 0);

    return products
      .filter((p) => p.category)
      .sort((a, b) => Number(b._sum.revenue || 0) - Number(a._sum.revenue || 0))
      .map((p) => ({
        name: p.category!,
        value: Number(p._sum.revenue || 0),
        count: p._count.id,
        percentage: totalRevenue > 0 ? (Number(p._sum.revenue || 0) / totalRevenue) * 100 : 0,
      }));
  }

  async getFinanceSummary(storeId: string, timeRange: string = 'month') {
    const { from, to } = this.getDateRange(timeRange);

    const [ordersAgg, expensesAgg, returnsAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          storeId,
          orderedAt: { gte: from, lte: to },
          status: { notIn: ['CANCELED', 'RETURNED'] },
        },
        _sum: { total: true, commission: true, deliveryFee: true, profit: true },
      }),
      this.prisma.expense.aggregate({
        where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.order.aggregate({
        where: { storeId, orderedAt: { gte: from, lte: to }, status: 'RETURNED' },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    const revenue = Number(ordersAgg._sum.total || 0);
    const commission = Number(ordersAgg._sum.commission || 0);
    const expenses = Number(expensesAgg._sum.amount || 0);
    const returnLoss = Number(returnsAgg._sum.total || 0);
    const profit = revenue - commission - expenses - returnLoss;

    return {
      revenue,
      commission,
      expenses,
      returnLoss,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      netRevenue: revenue - returnLoss,
      roi: expenses > 0 ? (profit / expenses) * 100 : 0,
    };
  }

  async getExpenseBreakdown(storeId: string, timeRange: string = 'month') {
    const { from, to } = this.getDateRange(timeRange);

    return this.prisma.expense.groupBy({
      by: ['category'],
      where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
      _sum: { amount: true },
      _count: { id: true },
    });
  }

  async getTransactions(storeId: string, page = 0, size = 20, dateFrom?: string, dateTo?: string) {
    const where: any = { storeId };
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
        select: {
          id: true,
          uzumOrderId: true,
          status: true,
          total: true,
          commission: true,
          profit: true,
          orderedAt: true,
          items: { select: { name: true }, take: 1 },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data: orders, total, page, size, totalPages: Math.ceil(total / size) };
  }

  private async getMetricsForPeriod(storeId: string, from: Date, to: Date) {
    const agg = await this.prisma.analyticsSnapshot.aggregate({
      where: { storeId, date: { gte: from, lte: to } },
      _sum: { revenue: true, profit: true, orders: true, commission: true },
    });
    return {
      revenue: Number(agg._sum.revenue || 0),
      profit: Number(agg._sum.profit || 0),
      orders: Number(agg._sum.orders || 0),
      commission: Number(agg._sum.commission || 0),
    };
  }

  private async getSparkline(
    storeId: string,
    from: Date,
    to: Date,
    field: 'revenue' | 'orders' | 'profit',
  ): Promise<number[]> {
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { storeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { revenue: true, orders: true, profit: true },
      take: 12,
    });
    return snapshots.map((s) => Number(s[field] || 0));
  }

  private getDateRange(timeRange: string): {
    from: Date;
    to: Date;
    prevFrom: Date;
    prevTo: Date;
  } {
    const to = endOfDay(new Date());
    let from: Date;
    let prevFrom: Date;
    let prevTo: Date;

    switch (timeRange) {
      case 'today':
        from = startOfDay(new Date());
        prevFrom = startOfDay(subDays(new Date(), 1));
        prevTo = endOfDay(subDays(new Date(), 1));
        break;
      case 'week':
        from = subDays(new Date(), 7);
        prevFrom = subDays(new Date(), 14);
        prevTo = subDays(new Date(), 7);
        break;
      case 'quarter':
        from = subMonths(new Date(), 3);
        prevFrom = subMonths(new Date(), 6);
        prevTo = subMonths(new Date(), 3);
        break;
      case 'year':
        from = subMonths(new Date(), 12);
        prevFrom = subMonths(new Date(), 24);
        prevTo = subMonths(new Date(), 12);
        break;
      default: // month
        from = subMonths(new Date(), 1);
        prevFrom = subMonths(new Date(), 2);
        prevTo = subMonths(new Date(), 1);
    }

    return { from, to, prevFrom, prevTo };
  }
}
