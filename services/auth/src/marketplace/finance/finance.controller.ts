import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../../common/database/prisma.service';

@Controller('marketplace/stores/:storeId/finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('summary')
  getFinanceSummary(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getFinanceSummary(storeId, timeRange);
  }

  @Get('expenses')
  getExpenseBreakdown(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getExpenseBreakdown(storeId, timeRange);
  }

  @Get('transactions')
  getTransactions(
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getTransactions(storeId, page, size, dateFrom, dateTo);
  }

  @Get('cashflow')
  getCashflow(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.getCashflowData(storeId, timeRange);
  }

  @Get('commission')
  getCommissionAnalysis(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.getCommissionData(storeId, timeRange);
  }

  @Get('roi')
  getRoiAnalysis(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.getRoiData(storeId, timeRange);
  }

  private async getCashflowData(storeId: string, timeRange: string) {
    const { from, to } = this.getDateRange(timeRange);

    const orders = await this.prisma.order.aggregate({
      where: {
        storeId,
        orderedAt: { gte: from, lte: to },
        status: { notIn: ['CANCELED', 'RETURNED'] },
      },
      _sum: { total: true, profit: true },
      _count: { id: true },
    });

    const expenses = await this.prisma.expense.aggregate({
      where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
      _sum: { amount: true },
      _count: { id: true },
    });

    const returns = await this.prisma.order.aggregate({
      where: {
        storeId,
        orderedAt: { gte: from, lte: to },
        status: 'RETURNED',
      },
      _sum: { total: true },
      _count: { id: true },
    });

    // Get daily breakdown for chart
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { storeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    const chartData = snapshots.map((s) => ({
      date: s.date.toISOString().split('T')[0],
      revenue: Number(s.revenue),
      profit: Number(s.profit),
      expenses: Number(s.revenue) - Number(s.profit) - Number(s.commission),
    }));

    return {
      revenue: Number(orders._sum.total || 0),
      profit: Number(orders._sum.profit || 0),
      expenses: Number(expenses._sum.amount || 0),
      returns: Number(returns._sum.total || 0),
      orders: orders._count.id,
      chartData,
    };
  }

  private async getCommissionData(storeId: string, timeRange: string) {
    const { from, to } = this.getDateRange(timeRange);

    const orders = await this.prisma.order.aggregate({
      where: {
        storeId,
        orderedAt: { gte: from, lte: to },
        status: { notIn: ['CANCELED', 'RETURNED'] },
      },
      _sum: { total: true, commission: true, deliveryFee: true },
    });

    const revenue = Number(orders._sum.total || 0);
    const commission = Number(orders._sum.commission || 0);
    const deliveryFee = Number(orders._sum.deliveryFee || 0);
    const paymentFee = revenue * 0.015; // Uzum payment fee

    return {
      baseCommission: commission,
      deliveryFee,
      paymentFee,
      totalCommission: commission + deliveryFee + paymentFee,
      commissionRate: revenue > 0 ? (commission / revenue) * 100 : 0,
    };
  }

  private async getRoiData(storeId: string, timeRange: string) {
    const { from, to } = this.getDateRange(timeRange);

    const finance = await this.analyticsService.getFinanceSummary(storeId, timeRange);

    const avgOrderValue = await this.prisma.order.aggregate({
      where: {
        storeId,
        orderedAt: { gte: from, lte: to },
        status: { notIn: ['CANCELED', 'RETURNED'] },
      },
      _sum: { total: true, profit: true },
      _count: { id: true },
    });

    const ordersCount = avgOrderValue._count.id;
    const avgProfitPerOrder = ordersCount > 0
      ? Number(avgOrderValue._sum.profit || 0) / ordersCount
      : 0;

    return {
      roi: finance.roi,
      netProfit: finance.profit,
      totalInvestment: finance.expenses,
      margin: finance.margin,
      ordersCount,
      avgProfitPerOrder,
    };
  }

  private getDateRange(timeRange: string): { from: Date; to: Date } {
    const to = new Date();
    let from: Date;

    switch (timeRange) {
      case 'today':
        from = new Date(to);
        from.setHours(0, 0, 0, 0);
        break;
      case 'week':
        from = new Date(to);
        from.setDate(from.getDate() - 7);
        break;
      case 'quarter':
        from = new Date(to);
        from.setMonth(from.getMonth() - 3);
        break;
      case 'year':
        from = new Date(to);
        from.setFullYear(from.getFullYear() - 1);
        break;
      default: // month
        from = new Date(to);
        from.setMonth(from.getMonth() - 1);
    }

    return { from, to };
  }
}