import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { FinanceSyncService } from '../finance/finance-sync.service';
import { startOfDay, subDays } from 'date-fns';

export type StatsRange = 'today' | 'week' | 'month';

export interface ExpenseCategoryDef {
  key: string; // matches Prisma ExpenseCategory enum
  label: string;
  emoji: string;
}

/** Order in which categories are offered in the bot's inline picker. */
export const EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: 'SHIPPING', label: 'Yetkazib berish', emoji: '🚚' },
  { key: 'PACKAGING', label: 'Qadoqlash', emoji: '📦' },
  { key: 'ADVERTISING', label: 'Reklama', emoji: '📣' },
  { key: 'COMMISSION', label: 'Komissiya', emoji: '🏷' },
  { key: 'TAX', label: 'Soliq', emoji: '🧾' },
  { key: 'SALARY', label: 'Maosh', emoji: '👷' },
  { key: 'RENT', label: 'Ijara', emoji: '🏢' },
  { key: 'OTHER', label: 'Boshqa', emoji: '🔖' },
];

export function categoryDef(key: string): ExpenseCategoryDef {
  return (
    EXPENSE_CATEGORIES.find((c) => c.key === key) || {
      key: 'OTHER',
      label: 'Boshqa',
      emoji: '🔖',
    }
  );
}

@Injectable()
export class TelegramStatsService {
  private readonly logger = new Logger(TelegramStatsService.name);
  /** Used only if the user has no usdRate stored (shouldn't happen — DB default 12900). */
  private readonly fallbackRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceSyncService,
    private readonly config: ConfigService,
  ) {
    const raw = Number(this.config.get<string>('USD_RATE'));
    this.fallbackRate = Number.isFinite(raw) && raw > 0 ? raw : 12900;
  }

  /**
   * The USD→UZS rate the user set on the website (persisted on User.usdRate), so
   * the bot's net profit matches the web exactly.
   */
  private async getUsdRate(userId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { usdRate: true },
    });
    return u?.usdRate && u.usdRate > 0 ? u.usdRate : this.fallbackRate;
  }

  // ─── Profit card (item 1: net profit = revenue − tan narx) ─────────────────

  /**
   * Headline "card" for a range. Net profit is computed exactly like the
   * website: `Sof foyda = daromad (sellerProfit) − tan narx (ProductMeta cost ×
   * sold qty)`. We reuse {@link FinanceSyncService.getDashboardSummary} per store
   * so the bot and web can never disagree.
   */
  async formatProfitCard(userId: string, range: StatsRange): Promise<string> {
    const stores = await this.getStoresForUser(userId);
    if (!stores.length) {
      return '🏪 Sizda do\'kon yo\'q. Avval saytdan do\'kon qo\'shing.';
    }

    const rate = await this.getUsdRate(userId);

    const results = await Promise.all(
      stores.map(async (s) => {
        try {
          const sum = await this.finance.getDashboardSummary(userId, s.id, {
            timeRange: range,
          });
          return { name: s.name, sum, error: null as string | null };
        } catch (e) {
          this.logger.warn(
            `dashboard summary failed for store ${s.id}: ${(e as Error).message}`,
          );
          return { name: s.name, sum: null, error: 'API ulanmagan yoki xato' };
        }
      }),
    );

    const ok = results.filter((r) => r.sum) as Array<{
      name: string;
      sum: NonNullable<(typeof results)[number]['sum']>;
    }>;
    const failed = results.filter((r) => !r.sum);

    let income = 0;
    let costUsd = 0;
    let orders = 0;
    let units = 0;
    let costedQty = 0;
    let totalSoldQty = 0;
    let from = 0;
    let to = 0;
    for (const r of ok) {
      const d: any = r.sum;
      income += Number(d.revenue) || 0;
      costUsd += Number(d.costUsd) || 0;
      orders += Number(d.orders) || 0;
      units += Number(d.unitsSold) || 0;
      costedQty += Number(d.coverage?.costedQty) || 0;
      totalSoldQty += Number(d.coverage?.totalSoldQty) || 0;
      if (d.dateFrom) from = from ? Math.min(from, d.dateFrom) : d.dateFrom;
      if (d.dateTo) to = Math.max(to, d.dateTo);
    }

    const costUzs = costUsd * rate;
    const net = income - costUzs;
    const margin = income > 0 ? (net / income) * 100 : 0;
    const costIncomplete = totalSoldQty > 0 && costedQty < totalSoldQty;

    const title =
      range === 'today'
        ? 'Bugungi savdo'
        : range === 'week'
          ? 'Haftalik savdo'
          : 'Oylik savdo';

    const lines: string[] = [];
    const dateLabel = from && to ? this.fmtRange(new Date(from), new Date(to)) : '';
    lines.push(`📊 <b>${title}</b>${dateLabel ? ' · ' + dateLabel : ''}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(
      `💰 <b>Sof foyda:</b> ${signedMoney(net)}` +
        (income > 0 ? ` · marja ${margin.toFixed(0)}%` : ''),
    );
    lines.push(`📈 Daromad: ${money(income)}`);
    lines.push(`🏷 Tan narx: ${costUzs > 0 ? '−' + money(costUzs) : money(0)}`);
    lines.push(`📦 Buyurtma: <b>${orders}</b> · 🛍 <b>${units}</b> dona`);

    if (costIncomplete) {
      lines.push('');
      lines.push(
        '⚠️ <i>Ba\'zi sotuvlarga tan narx kiritilmagan — marja taxminiy. ' +
          'Saytda mahsulot tan narxlarini to\'ldiring.</i>',
      );
    }

    if (stores.length > 1) {
      lines.push('');
      lines.push('🏪 <b>Do\'konlar bo\'yicha:</b>');
      for (const r of ok) {
        const d: any = r.sum;
        const sNet =
          (Number(d.revenue) || 0) - (Number(d.costUsd) || 0) * rate;
        lines.push(
          `• ${escapeHtml(r.name)} — foyda ${signedMoney(sNet)} · ${Number(d.orders) || 0} buyurtma`,
        );
      }
      for (const f of failed) {
        lines.push(`• ${escapeHtml(f.name)} — ⚠️ ${escapeHtml(f.error || '')}`);
      }
    } else if (failed.length) {
      lines.push('');
      lines.push(`⚠️ ${escapeHtml(failed[0].error || '')}`);
    }

    // Single-store extra: top products by revenue.
    if (stores.length === 1 && ok.length === 1) {
      const top: any[] = (ok[0].sum as any).topProducts || [];
      if (top.length) {
        lines.push('');
        lines.push('🏆 <b>Top mahsulotlar:</b>');
        for (const p of top.slice(0, 5)) {
          lines.push(
            `• ${escapeHtml(p.name)} — ${money(Number(p.revenue) || 0)} (${Number(p.soldCount) || 0} dona)`,
          );
        }
      }
    }

    if (orders === 0 && !failed.length) {
      lines.push('');
      lines.push('<i>Bu davrda buyurtma yo\'q.</i>');
    }

    return lines.join('\n');
  }

  // ─── Stores list ──────────────────────────────────────────────────────────

  async formatStoresList(userId: string): Promise<string> {
    const stores = await this.prisma.store.findMany({
      where: { userId },
      include: {
        connection: { select: { isConnected: true, lastSyncAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!stores.length) {
      return '🏪 Sizda do\'kon yo\'q. Avval saytdan do\'kon qo\'shing.';
    }

    const lines: string[] = ['🏪 <b>Do\'konlaringiz:</b>', ''];
    for (const s of stores) {
      const conn = s.connection;
      const status = conn?.isConnected ? '🟢 Ulangan' : '⚪ Ulanmagan';
      const lastSync = conn?.lastSyncAt
        ? new Date(conn.lastSyncAt).toLocaleString('uz-UZ')
        : '—';
      lines.push(`<b>${escapeHtml(s.name)}</b>`);
      lines.push(`  Holat: ${status}`);
      lines.push(`  Oxirgi sync: ${lastSync}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  // ─── Expenses (data entry / read) ─────────────────────────────────────────

  async getStoresForUser(
    userId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.store.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async userOwnsStore(userId: string, storeId: string): Promise<boolean> {
    const s = await this.prisma.store.findFirst({
      where: { id: storeId, userId },
      select: { id: true },
    });
    return !!s;
  }

  async addExpense(input: {
    storeId: string;
    category: string;
    amount: number;
    description: string;
  }): Promise<{ id: string }> {
    return this.prisma.expense.create({
      data: {
        storeId: input.storeId,
        category: input.category as any,
        amount: input.amount,
        description: input.description,
        source: 'telegram',
        date: new Date(),
      },
      select: { id: true },
    });
  }

  async deleteExpense(userId: string, expenseId: string): Promise<boolean> {
    const storeIds = await this.getUserStoreIds(userId);
    const res = await this.prisma.expense.updateMany({
      where: { id: expenseId, storeId: { in: storeIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  async formatExpensesList(
    userId: string,
    page: number,
    pageSize = 5,
  ): Promise<{
    text: string;
    items: Array<{ id: string; label: string }>;
    page: number;
    totalPages: number;
  }> {
    const storeIds = await this.getUserStoreIds(userId);
    if (!storeIds.length) {
      return { text: '🏪 Sizda do\'kon yo\'q.', items: [], page: 0, totalPages: 0 };
    }

    const where = { storeId: { in: storeIds }, deletedAt: null } as const;
    const total = await this.prisma.expense.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);

    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: safePage * pageSize,
      take: pageSize,
      select: {
        id: true,
        category: true,
        amount: true,
        description: true,
        date: true,
        store: { select: { name: true } },
      },
    });

    const monthAgo = startOfDay(subDays(new Date(), 29));
    const agg = await this.prisma.expense.aggregate({
      where: { ...where, date: { gte: monthAgo } },
      _sum: { amount: true },
    });
    const monthTotal = Number(agg._sum.amount || 0);

    const lines: string[] = [];
    lines.push('📉 <b>Xarajatlar</b>');
    lines.push(`30 kunlik jami: <b>${money(monthTotal)}</b>`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');

    if (!rows.length) {
      lines.push('');
      lines.push('<i>Hali xarajat kiritilmagan.</i>');
    }

    const items = rows.map((e) => {
      const cat = categoryDef(String(e.category));
      const when = new Date(e.date).toLocaleDateString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
      });
      lines.push('');
      lines.push(
        `${cat.emoji} <b>${money(Number(e.amount))}</b> · ${escapeHtml(cat.label)}`,
      );
      lines.push(
        `   ${escapeHtml(e.description || '—')} · ${when} · ${escapeHtml(e.store?.name || '')}`,
      );
      return {
        id: e.id,
        label: `${cat.emoji} ${money(Number(e.amount))} · ${when}`,
      };
    });

    return { text: lines.join('\n'), items, page: safePage, totalPages };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async getUserStoreIds(userId: string): Promise<string[]> {
    const stores = await this.prisma.store.findMany({
      where: { userId },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }

  private fmtRange(from: Date, to: Date): string {
    const f = from.toLocaleDateString('uz-UZ');
    const t = to.toLocaleDateString('uz-UZ');
    return f === t ? f : `${f} — ${t}`;
  }
}

function money(n: number): string {
  return (
    Math.abs(Math.round(n)).toLocaleString('uz-UZ', {
      maximumFractionDigits: 0,
    }) + ' so\'m'
  );
}

function signedMoney(n: number): string {
  const sign = n < 0 ? '−' : '+';
  return sign + money(n);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
