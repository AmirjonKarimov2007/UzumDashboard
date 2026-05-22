import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { subDays, format, eachDayOfInterval, parseISO, startOfDay } from 'date-fns';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinanceSyncService {
  private readonly logger = new Logger(FinanceSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
  ) {}

  async syncExpenses(
    storeId: string,
    uzumShopId: string,
    apiKey: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<number> {
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : subDays(new Date(), 90).getTime();
    const toMs = dateTo ? new Date(dateTo).getTime() : new Date().getTime();

    this.logger.log(`Syncing expenses for store ${storeId} from ${dateFrom || 'last 90d'} to ${dateTo || 'now'}`);

    const expenses = await this.uzumClient.getAllExpenses(storeId, apiKey, [uzumShopId], fromMs, toMs);

    if (!expenses.length) return 0;

    let synced = 0;
    for (const e of expenses) {
      await this.prisma.expense.upsert({
        where: {
          id: `uzum_${e.id}`,
        },
        create: {
          id: `uzum_${e.id}`,
          storeId,
          category: this.mapExpenseCategory(e.type),
          description: e.description || e.type,
          amount: (e.amount || 0) / 100,
          source: 'uzum',
          uzumRef: String(e.id),
          date: e.date ? new Date(e.date) : new Date(),
        },
        update: {
          amount: (e.amount || 0) / 100,
          description: e.description || e.type,
        },
      });
      synced++;
    }

    this.logger.log(`Synced ${synced} expenses for store ${storeId}`);
    return synced;
  }

  async buildAnalyticsSnapshots(storeId: string): Promise<void> {
    this.logger.log(`Building analytics snapshots for store ${storeId}`);

    // Get date range from orders
    const dateRange = await this.prisma.order.aggregate({
      where: { storeId, orderedAt: { not: null } },
      _min: { orderedAt: true },
      _max: { orderedAt: true },
    });

    if (!dateRange._min.orderedAt) return;

    const fromDate = startOfDay(dateRange._min.orderedAt);
    const toDate = startOfDay(dateRange._max.orderedAt || new Date());

    const days = eachDayOfInterval({ start: fromDate, end: toDate });

    for (const day of days) {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);

      const [ordersAgg, returnsAgg, commissionsAgg, expensesAgg] = await Promise.all([
        this.prisma.order.aggregate({
          where: {
            storeId,
            orderedAt: { gte: dayStart, lte: dayEnd },
            status: { notIn: ['CANCELED', 'RETURNED', 'PENDING_CANCELLATION'] },
          },
          _sum: { total: true, profit: true, commission: true },
          _count: { id: true },
        }),
        this.prisma.order.aggregate({
          where: {
            storeId,
            orderedAt: { gte: dayStart, lte: dayEnd },
            status: { in: ['RETURNED', 'CANCELED'] },
          },
          _sum: { total: true },
          _count: { id: true },
        }),
        this.prisma.order.aggregate({
          where: { storeId, orderedAt: { gte: dayStart, lte: dayEnd } },
          _sum: { commission: true },
        }),
        this.prisma.expense.aggregate({
          where: { storeId, date: { gte: dayStart, lte: dayEnd }, deletedAt: null },
          _sum: { amount: true },
        }),
      ]);

      const revenue = Number(ordersAgg._sum.total || 0);
      const commission = Number(commissionsAgg._sum.commission || 0);
      const expenseTotal = Number(expensesAgg._sum.amount || 0);
      const returnValue = Number(returnsAgg._sum.total || 0);
      const profit = revenue - commission - expenseTotal - returnValue;
      const netRevenue = revenue - returnValue;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      const productCount = await this.prisma.product.count({
        where: { storeId, status: 'ACTIVE', deletedAt: null },
      });

      await this.prisma.analyticsSnapshot.upsert({
        where: { storeId_date: { storeId, date: dayStart } },
        create: {
          storeId,
          date: dayStart,
          revenue,
          netRevenue,
          orders: ordersAgg._count.id,
          products: productCount,
          commission,
          profit,
          margin,
          returns: returnsAgg._count.id,
          returnValue,
        },
        update: {
          revenue,
          netRevenue,
          orders: ordersAgg._count.id,
          products: productCount,
          commission,
          profit,
          margin,
          returns: returnsAgg._count.id,
          returnValue,
        },
      });
    }

    this.logger.log(`Built analytics snapshots for ${days.length} days`);
  }

  private mapExpenseCategory(type: string): any {
    const upper = type?.toUpperCase() || '';
    if (upper.includes('COMMISSION') || upper.includes('КОМИССИЯ')) return 'COMMISSION';
    if (upper.includes('SHIPPING') || upper.includes('ДОСТАВКА')) return 'SHIPPING';
    if (upper.includes('ADVERTISING') || upper.includes('РЕКЛАМА')) return 'ADVERTISING';
    if (upper.includes('TAX') || upper.includes('НАЛОГ')) return 'TAX';
    if (upper.includes('PACKAGING') || upper.includes('УПАКОВКА')) return 'PACKAGING';
    return 'OTHER';
  }
}
