import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { subDays, format, eachDayOfInterval, parseISO, startOfDay } from 'date-fns';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'fs/promises';
import * as path from 'path';

// Heuristic: keywords (multi-lingual) that mark a payment expense as a withdrawal/payout.
// Uzum returns Russian descriptions; we also accept Uzbek + English fallbacks.
const WITHDRAWAL_KEYWORDS = [
  'вывод',          // ru: vyvod (withdrawal)
  'выплат',         // ru: vyplata (payout)
  'мблаг',          // typo guard
  'mablag',         // uz: mablag' yechib olish
  'yechib olish',   // uz: withdrawal
  "so'rovnoma",     // uz: request (often paired with withdrawal description)
  'withdraw',       // en
  'payout',         // en
  'transfer to account', // en
];

// Keywords that identify a fine/penalty deduction.
// "Uzum Market" is the explicit source for Uzum's platform fines in this seller's data.
const FINE_KEYWORDS = [
  'штраф',          // ru: shtraf (fine)
  'пенал',          // ru: penalty
  'санкц',          // ru: sanktsiya (sanction)
  'удержан',        // ru: uderzhanie (deduction/forfeit)
  'неустойк',       // ru: neustojka (penalty)
  'jarima',         // uz: fine
  'penal',          // uz/en: penalty
  'fine',           // en
  'forfeit',        // en
  'sanction',       // en
  'uzum market',    // Uzum's source name for platform fines/penalties
];

// Keywords that identify service payments — logistics, delivery, packaging,
// fulfillment, storage, processing fees, etc. These appear in /v1/finance/expenses
// as separate billing entries (NOT the per-order shipping fee).
const SERVICE_KEYWORDS = [
  'логистик',       // ru: logistika
  'logistika',      // uz
  'logistic',       // en
  'доставк',        // ru: dostavka (delivery)
  'yetkazib',       // uz: yetkazib berish
  'delivery',       // en
  'shipping',       // en
  'упаковк',        // ru: upakovka (packaging)
  'qadoq',          // uz: qadoqlash
  'packaging',      // en
  'фулфилм',        // ru: fulfillment
  'fulfillment',    // en
  'хранен',         // ru: khranenie (storage)
  'saqlash',        // uz: saqlash
  'storage',        // en
  'обработк',       // ru: obrabotka (processing)
  'процессинг',     // ru: processing
  'processing',     // en
  'сборк',          // ru: sborka (assembly/picking)
  'комплект',       // ru: komplekt (kitting)
  'сервис',         // ru: servis
  'xizmat',         // uz: xizmat (service)
  'service',        // en
];

// Keywords that mark an expense entry as an INCOME (refund/return/compensation)
// rather than a deduction. Used inside service-payment classification to compute
// income vs outcome totals.
const INCOME_KEYWORDS = [
  'возврат',        // ru: vozvrat (refund)
  'возмещен',       // ru: vozmeshchenie (reimbursement)
  'компенсац',      // ru: kompensatsiya
  'qaytarish',      // uz
  'qaytar',         // uz: short form
  'kompensatsiya',  // uz
  'refund',         // en
  'reimburs',       // en
  'compensation',   // en
  'credit back',    // en
];

const matchesAny = (kws: readonly string[], expense: { type?: string; description?: string; source?: string }): boolean => {
  const blob = `${expense.type || ''} ${expense.description || ''} ${expense.source || ''}`.toLowerCase();
  return kws.some((kw) => blob.includes(kw));
};

const isWithdrawal = (e: { type?: string; description?: string; source?: string }) => matchesAny(WITHDRAWAL_KEYWORDS, e);
const isFine = (e: { type?: string; description?: string; source?: string }) => matchesAny(FINE_KEYWORDS, e);
const isService = (e: { type?: string; description?: string; source?: string }) => matchesAny(SERVICE_KEYWORDS, e);
const isIncome = (e: { type?: string; description?: string; source?: string; amount?: number }) => {
  // Negative amount from Uzum API = refund/credit back. Treat as income.
  if (typeof e.amount === 'number' && e.amount < 0) return true;
  return matchesAny(INCOME_KEYWORDS, e);
};

@Injectable()
export class FinanceSyncService {
  private readonly logger = new Logger(FinanceSyncService.name);

  // In-memory cache for reconciliation — avoids hammering Uzum API on every page load.
  // Keyed by storeId+date-range. TTL 5 min. In-process only (no Redis dep).
  private reconCache = new Map<string, { fetchedAt: number; payload: any }>();
  private readonly RECON_CACHE_TTL_MS = 5 * 60 * 1000;
  // Track in-flight requests so concurrent page loads share a single Uzum fetch.
  private reconInflight = new Map<string, Promise<any>>();

  // ─── Disk cache (JSON) ─────────────────────────────────────────────────
  // For resilience: if Uzum API fails or rate-limits mid-fetch, we still have
  // the last successful payload on disk. Also speeds up restart — no need to
  // re-paginate through hundreds of expenses every time the service reboots.
  private readonly diskCacheDir = path.join(process.cwd(), '.cache', 'finance');
  private readonly diskCacheTtlMs = 24 * 60 * 60 * 1000; // 24h — keep even when expired so we can fall back

  private diskCachePath(storeId: string, dateFrom: number | undefined, dateTo: number | undefined): string {
    // Bucket dates to nearest hour so file names are stable when the range hasn't really changed.
    const bucket = (ms?: number) => (ms ? Math.floor(ms / (60 * 60 * 1000)) : 'all');
    return path.join(this.diskCacheDir, `${storeId}-${bucket(dateFrom)}-${bucket(dateTo)}.json`);
  }

  private async readDiskCache(filePath: string): Promise<{ fetchedAt: number; payload: any } | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async writeDiskCache(filePath: string, payload: any): Promise<void> {
    try {
      await fs.mkdir(this.diskCacheDir, { recursive: true });
      const entry = { fetchedAt: Date.now(), payload };
      await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
      this.logger.log(`Disk cache written: ${path.basename(filePath)} (${(JSON.stringify(entry).length / 1024).toFixed(1)} KB)`);
    } catch (err: any) {
      this.logger.warn(`Disk cache write failed: ${err?.message}`);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
  ) {}

  // ─── Generic Stale-While-Revalidate cache ──────────────────────────────
  //
  // The single biggest speed win: never block a page on Uzum after the first
  // successful fetch. Behaviour per key:
  //   • fresh (< ttl)        → return memory instantly
  //   • stale (>= ttl)       → return stale instantly + refresh in background
  //   • cold (no memory)     → warm from disk if present (instant), else fetch
  //   • force                → fetch fresh, await
  // Disk persistence means even a server restart serves instantly.
  private swrStore = new Map<string, { fetchedAt: number; payload: any }>();
  private swrInflight = new Map<string, Promise<any>>();

  private swrDiskPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.diskCacheDir, `swr-${safe}.json`);
  }

  private swrRun(key: string, producer: () => Promise<any>): Promise<any> {
    const existing = this.swrInflight.get(key);
    if (existing) return existing;
    const p = (async () => {
      const payload = await producer();
      this.swrStore.set(key, { fetchedAt: Date.now(), payload });
      void this.writeDiskCache(this.swrDiskPath(key), payload);
      return payload;
    })().finally(() => this.swrInflight.delete(key));
    this.swrInflight.set(key, p);
    return p;
  }

  private swrRevalidate(key: string, producer: () => Promise<any>) {
    if (this.swrInflight.has(key)) return;
    void this.swrRun(key, producer).catch((e) =>
      this.logger.warn(`SWR background refresh failed (${key}): ${e?.message}`),
    );
  }

  private async swr(opts: {
    key: string;
    ttlMs: number;
    force?: boolean;
    producer: () => Promise<any>;
  }): Promise<any> {
    const { key, ttlMs, force, producer } = opts;
    if (force) return this.swrRun(key, producer);

    const now = Date.now();
    let mem = this.swrStore.get(key);
    if (!mem) {
      const disk = await this.readDiskCache(this.swrDiskPath(key));
      if (disk) {
        this.swrStore.set(key, disk);
        mem = disk;
      }
    }
    if (mem) {
      const fresh = now - mem.fetchedAt < ttlMs;
      if (!fresh) this.swrRevalidate(key, producer);
      return { ...mem.payload, _cached: fresh ? 'fresh' : 'stale' };
    }
    return this.swrRun(key, producer);
  }

  // ─── Lightweight Logistics + Fines summary ─────────────────────────────
  //
  // Hits /v1/finance/expenses?page=0&size=1500&shopId=X&shopIds=X once,
  // partitions payments into:
  //   • logistics  — source matches "Logistika"
  //   • fines      — source is "Uzum Market" OR matches "ombor" (Uzum warehouse fines)
  // Returns just the totals + counts — no balance, no P&L, no other expense buckets.
  // Served via stale-while-revalidate (instant after first load).

  async getLogisticsAndFines(userId: string, storeId: string, opts: { force?: boolean } = {}) {
    return this.swr({
      key: `logfines:${storeId}`,
      ttlMs: this.RECON_CACHE_TTL_MS,
      force: opts.force,
      producer: () => this.computeLogisticsAndFines(userId, storeId),
    });
  }

  private async computeLogisticsAndFines(userId: string, storeId: string) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    // Paginate expenses using Uzum's `totalElements` to know when to stop — no more
    // 11 separate FBS-count calls just to guess a size. One big page usually suffices.
    const SIZE = 1500;
    const payments: any[] = [];
    for (let page = 0; page < 20; page++) {
      const { payments: pg, totalElements } = await this.uzumClient.getRawExpenses(
        storeId, apiKey, uzumShopId, page, SIZE,
      );
      payments.push(...pg);
      if (pg.length < SIZE || payments.length >= totalElements) break;
    }

    type Item = { id: string; amount: number; source: string; description: string; date: number | null; status: string };
    const logistics: Item[] = [];
    const fines: Item[] = [];
    const refunds: Item[] = []; // type === "INCOME" — money returned to seller

    for (const e of payments) {
      // paymentPrice is PER UNIT; `amount` is the quantity. Real charge = price × qty.
      // (e.g. logistics 8000 × 4 units = 32000 so'm). Older code summed only the unit
      // price which under-counted multi-unit logistics lines.
      const unitPrice = Math.abs(Number(e.paymentPrice ?? 0));
      const qty = Number(e.amount ?? 1) || 1;
      const amount = unitPrice * qty;
      if (!amount) continue;
      const source = String(e.source || '').trim();
      const description = String(e.name || e.description || e.comment || source);
      const dateMs = e.dateCreated ? Number(e.dateCreated) : e.date ? new Date(e.date).getTime() : null;
      const status = String(e.status || 'UNKNOWN').toUpperCase();
      const id = String(e.id ?? `${source}-${dateMs}-${amount}`);
      const item: Item = { id, amount, source, description, date: dateMs, status };

      // INCOME items = money Uzum returned to the seller (refunds, compensations).
      // Put them in their own bucket so they don't pollute Logistika / Jarimalar.
      const direction = String(e.type || '').toUpperCase();
      if (direction === 'INCOME') {
        refunds.push(item);
        continue;
      }

      const src = source.toLowerCase();
      if (src.includes('logistik')) {
        logistics.push(item);
      } else if (src.includes('uzum market') || src.includes('ombor')) {
        // "Uzum Market" = platform fines; "Uzum ombori" = warehouse fines
        fines.push(item);
      }
    }

    const logisticsTotal = logistics.reduce((s, x) => s + x.amount, 0);
    const finesTotal = fines.reduce((s, x) => s + x.amount, 0);
    const refundsTotal = refunds.reduce((s, x) => s + x.amount, 0);

    const payload = {
      logisticsTotal,
      logisticsCount: logistics.length,
      finesTotal,
      finesCount: fines.length,
      // "Jami yechilgan" = Logistika + Jarimalar ONLY — refunds intentionally excluded
      combined: logisticsTotal + finesTotal,
      // INCOME bucket — Uzum returned money to seller (refunds, compensations)
      refundsTotal,
      refundsCount: refunds.length,
      totalExpenses: payments.length,
      fbsOrdersCount: payments.length,
      requestedSize: payments.length,
      logistics,
      fines,
      refunds,
    };

    return payload;
  }

  // ─── Processing + Withdraw totals (Jarayonda / To'langan) ──────────────
  //
  // For each of statuses [PROCESSING, TO_WITHDRAW] we call /v1/finance/orders
  // (no date filter, group=false) and sum sellerProfit+logisticDeliveryFee per item.
  //
  // The `size` parameter is computed the same way as logistics-fines: sum of
  // FBS order counts × 1.5, but EXCLUDING RETURNED and CANCELED (+ PENDING_CANCELLATION)
  // — those orders never reach a payable state.
  async getProcessingAndWithdraw(userId: string, storeId: string, opts: { force?: boolean } = {}) {
    return this.swr({
      key: `procwithdraw:${storeId}`,
      ttlMs: this.RECON_CACHE_TTL_MS,
      force: opts.force,
      producer: () => this.computeProcessingAndWithdraw(userId, storeId),
    });
  }

  private async computeProcessingAndWithdraw(userId: string, storeId: string) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    // Paginate each status by Uzum's `total` (totalElements) — no FBS-count loop.
    const SIZE = 500;
    const fetchAll = async (status: string) => {
      const items: any[] = [];
      let apiTotal = 0;
      for (let page = 0; page < 40; page++) {
        const { orderItems, total } = await this.uzumClient.getFinanceOrders(storeId, apiKey, [uzumShopId], {
          page, size: SIZE, statuses: [status], group: false,
        });
        apiTotal = total;
        items.push(...orderItems);
        if (orderItems.length < SIZE || items.length >= total) break;
      }
      return { items, apiTotal };
    };

    // Pul yig'indisi — BARCHA item'lar bo'yicha; soni — UNIQUE orderId bo'yicha.
    const aggregate = (items: any[]) => {
      let total = 0;
      const uniqueOrderIds = new Set<string | number>();
      for (const it of items) {
        total += Number(it.sellerProfit || 0) + Number(it.logisticDeliveryFee || 0);
        if (it.orderId != null) uniqueOrderIds.add(it.orderId);
      }
      return { total, uniqueCount: uniqueOrderIds.size, itemsCount: items.length };
    };

    const [processing, withdraw] = await Promise.all([fetchAll('PROCESSING'), fetchAll('TO_WITHDRAW')]);
    const processingAgg = aggregate(processing.items);
    const withdrawAgg = aggregate(withdraw.items);

    return {
      processing: {
        total: processingAgg.total,
        count: processingAgg.uniqueCount,
        itemsCount: processingAgg.itemsCount,
        apiTotal: processing.apiTotal,
      },
      withdraw: {
        total: withdrawAgg.total,
        count: withdrawAgg.uniqueCount,
        itemsCount: withdrawAgg.itemsCount,
        apiTotal: withdraw.apiTotal,
      },
      combined: processingAgg.total + withdrawAgg.total,
      fbsActiveOrders: processingAgg.uniqueCount + withdrawAgg.uniqueCount,
      requestedSize: SIZE,
    };
  }

  // ─── Bosh sahifa (dashboard) summary ───────────────────────────────────
  //
  // Returns the 4 headline KPIs for the home page, scoped to a time range
  // (today / week / month / quarter / year):
  //   • revenue       — Jami daromad: Σ sellerProfit over FBS finance orders
  //                     (PROCESSING + TO_WITHDRAW) within the date range.
  //                     ONLY sellerProfit (no logistics).
  //   • orders        — Tanlangan davrda tushgan buyurtmalar (local Order table, orderedAt in range)
  //   • activeProducts— Hozirgi faol mahsulotlar soni (live Uzum, filter=ACTIVE — not range-bound)
  //   • totalCost     — Σ (sold qty × tan narx) using ProductMeta.costPrice per SKU
  //   • netProfit     — Sof foyda = revenue − totalCost
  //
  // Served via stale-while-revalidate (instant after first load).

  /** Resolve a dashboard time-range id to a [from, to] window. */
  private resolveRange(timeRange: string): { from: Date; to: Date } {
    const to = new Date();
    let from: Date;
    switch (timeRange) {
      case 'week':    from = subDays(to, 7); break;
      case 'month':   from = subDays(to, 30); break;
      case 'quarter': from = subDays(to, 90); break;
      case 'year':    from = subDays(to, 365); break;
      case 'today':
      default:        from = startOfDay(to); break;
    }
    return { from, to };
  }

  async getDashboardSummary(
    userId: string,
    storeId: string,
    opts: { force?: boolean; timeRange?: string; dateFrom?: number; dateTo?: number } = {},
  ) {
    const timeRange = opts.timeRange || 'today';
    // Custom sana oralig'i berilsa, uni soatga buketlab kesh kalitiga aylantiramiz
    // (bir xil oraliq qayta tanlanganda kesh barqaror bo'ladi).
    const hasCustom = opts.dateFrom != null && opts.dateTo != null;
    const bucket = (ms?: number) => (ms != null ? Math.floor(ms / (60 * 60 * 1000)) : 'x');
    const key = hasCustom
      ? `dashboard:${storeId}:custom:${bucket(opts.dateFrom)}-${bucket(opts.dateTo)}`
      : `dashboard:${storeId}:${timeRange}`;
    return this.swr({
      key,
      ttlMs: this.RECON_CACHE_TTL_MS,
      force: opts.force,
      producer: () => this.computeDashboardSummary(userId, storeId, timeRange, opts.force, {
        dateFrom: opts.dateFrom, dateTo: opts.dateTo,
      }),
    });
  }

  // ── Tan narx resolution (mahsulot ro'yxati + ProductMeta) ──
  // Mahsulot ro'yxati BARCHA davrlar uchun bir xil, shuning uchun uni alohida
  // SWR kalitida keshlaymiz — "Bugun"→"Hafta"→"Oy" o'tishlarida qayta yuklanmaydi.
  // Finance orderItems'da skuId YO'Q — faqat productId va skuTitle bor.
  // skuTitle === product.skuFullTitle, shuning uchun skuFullTitle → costUsd
  // (va productId → costUsd, agar mahsulotning barcha SKU'lari bir xil narxda) quramiz.
  /**
   * Public: skuTitle/productId → costUsd xaritasini qaytaradi (dashboard bilan
   * bir xil manba, SWR keshlangan). Boshqa modullar (FBS ta'minlash) tan narx
   * yig'indisini hisoblash uchun ishlatadi.
   */
  resolveCosts(userId: string, storeId: string, force?: boolean) {
    return this.getCostResolution(userId, storeId, force);
  }

  private getCostResolution(userId: string, storeId: string, force?: boolean): Promise<{
    activeProducts: number;
    skusWithCost: number;
    costByFullTitle: Record<string, number>;
    costByProductId: Record<string, number>;
  }> {
    return this.swr({
      key: `costres:${storeId}`,
      ttlMs: this.RECON_CACHE_TTL_MS,
      force,
      producer: () => this.computeCostResolution(userId, storeId),
    });
  }

  private async computeCostResolution(userId: string, storeId: string) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const [allProducts, metas] = await Promise.all([
      this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId).catch((err: any) => {
        this.logger.warn(`CostRes: product list fetch failed: ${err?.message}`);
        return [] as any[];
      }),
      this.prisma.productMeta.findMany({
        where: { storeId, costPrice: { not: null } },
        select: { skuId: true, costPrice: true },
      }),
    ]);

    // Uzum mahsulot statusi "ACTIVE" qiymatini qaytarmaydi (ARCHIVED/RUN_OUT/IN_STOCK/...).
    // Faol mahsulot = Uzum'ning o'z `isActive` flagi (arxivlanmagan/bloklanmagan, sotuvda).
    const activeProducts = allProducts.filter(
      (p: any) => p?.isActive === true || p?.status?.value === 'IN_STOCK' || p?.status?.value === 'READY_TO_SEND',
    ).length;

    const costBySkuId = new Map<string, number>();
    for (const m of metas) {
      if (m.costPrice != null) costBySkuId.set(m.skuId, Number(m.costPrice));
    }
    // Plain objects (not Maps) so the payload serializes to the disk cache.
    const costByFullTitle: Record<string, number> = {};
    const costsByProductId = new Map<string, Set<number>>();
    for (const p of allProducts) {
      const pid = String(p?.productId ?? '');
      for (const s of p?.skuList || []) {
        const sid = s?.skuId != null ? String(s.skuId) : null;
        if (!sid) continue;
        const cp = costBySkuId.get(sid);
        if (cp == null) continue;
        if (s?.skuFullTitle) costByFullTitle[s.skuFullTitle] = cp;
        if (s?.skuTitle) costByFullTitle[s.skuTitle] = cp; // fallback nomi
        if (pid) {
          if (!costsByProductId.has(pid)) costsByProductId.set(pid, new Set());
          costsByProductId.get(pid)!.add(cp);
        }
      }
    }
    const costByProductId: Record<string, number> = {};
    for (const [pid, set] of costsByProductId) {
      if (set.size === 1) costByProductId[pid] = [...set][0];
    }

    return { activeProducts, skusWithCost: costBySkuId.size, costByFullTitle, costByProductId };
  }

  private async computeDashboardSummary(
    userId: string,
    storeId: string,
    timeRange: string,
    force?: boolean,
    custom?: { dateFrom?: number; dateTo?: number },
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    // Custom sana oralig'i ustun: berilsa preset timeRange'ni inkor qiladi.
    let fromMs: number;
    let toMs: number;
    if (custom?.dateFrom != null && custom?.dateTo != null) {
      fromMs = Math.min(custom.dateFrom, custom.dateTo);
      toMs = Math.max(custom.dateFrom, custom.dateTo);
    } else {
      const { from, to } = this.resolveRange(timeRange);
      fromMs = from.getTime();
      toMs = to.getTime();
    }

    // ── Bitta date-filtered finance/orders so'rovi (status filtri YO'Q) ──
    // /v2/fbs/orders bu do'kon uchun bo'sh; /v1/finance/orders esa sellerProfit,
    // skuTitle, productId, amount, amountReturns va date (ms) ni qaytaradi.
    // CANCELED itemlar daromadga kirmaydi. Bitta so'rov = tezroq.
    const PAGE_SIZE = 500;
    const MAX_PAGES = 40; // up to 20k items
    const fetchAll = async (): Promise<any[]> => {
      const out: any[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const resp = await this.uzumClient.getFinanceOrders(storeId, apiKey, [uzumShopId], {
          page, size: PAGE_SIZE, group: false, dateFrom: fromMs, dateTo: toMs,
        });
        out.push(...resp.orderItems);
        if (resp.orderItems.length < PAGE_SIZE || out.length >= resp.total) break;
      }
      return out;
    };

    const [items, cost] = await Promise.all([
      fetchAll().catch((err: any) => {
        this.logger.warn(`Dashboard: finance orders fetch failed: ${err?.message}`);
        return [] as any[];
      }),
      this.getCostResolution(userId, storeId, force),
    ]);

    // ── Aggregate: Σ sellerProfit (revenue) + tan narx (USD) sotilgan soni bo'yicha ──
    let revenue = 0;
    let financeItems = 0;
    let costUsd = 0;
    let costedQty = 0;       // tan narxi topilgan sotilgan birliklar
    let totalSoldQty = 0;    // jami sotilgan birliklar
    const orderIds = new Set<string | number>();
    const soldTitles = new Set<string>();
    for (const it of items) {
      // Bekor qilingan buyurtmalar daromadga/sof foydaga kirmaydi.
      const status = String(it.status || '').toUpperCase();
      if (it.cancelled === true || status === 'CANCELED' || status === 'CANCELLED') continue;

      revenue += Number(it.sellerProfit || 0);
      financeItems++;
      if (it.orderId != null) orderIds.add(it.orderId);

      const qty = Number(it.amount || 0) - Number(it.amountReturns || 0);
      if (qty <= 0) continue;
      totalSoldQty += qty;
      if (it.skuTitle) soldTitles.add(String(it.skuTitle));
      // Tan narxni skuTitle (=skuFullTitle) bo'yicha, bo'lmasa productId bo'yicha topamiz
      let cp = it.skuTitle != null ? cost.costByFullTitle[String(it.skuTitle)] : undefined;
      if (cp == null && it.productId != null) cp = cost.costByProductId[String(it.productId)];
      if (cp != null) {
        costUsd += cp * qty;
        costedQty += qty;
      }
    }

    const payload = {
      timeRange,
      dateFrom: fromMs,
      dateTo: toMs,
      revenue,                                   // Jami daromad (sellerProfit only, UZS)
      orders: orderIds.size,                     // Davrda tushgan buyurtmalar (noyob orderId)
      activeProducts: cost.activeProducts,       // Faol mahsulotlar
      costUsd,                                   // Sotilgan mahsulotlar tan narxi (USD jami)
      coverage: {
        skusWithCost: cost.skusWithCost,         // nechta SKU ga tan narx kiritilgan
        skusSold: soldTitles.size,               // nechta SKU sotilgan
        costedQty,                               // tan narxi bor sotilgan birliklar
        totalSoldQty,                            // jami sotilgan birliklar
      },
      financeItems,
    };

    return payload;
  }

  /**
   * Live reconciliation: fetches sales (transfers) and expenses (withdrawals + deductions)
   * from Uzum's /v1/finance/orders and /v1/finance/expenses, then computes:
   *
   *   balance = SUM(order.transfer) − SUM(withdrawals) − SUM(other deductions)
   *
   * `dateFrom` and `dateTo` are unix ms. If omitted, fetches the last 2 years.
   * Results are cached for 5 minutes and concurrent requests for the same range are
   * de-duplicated to a single Uzum fetch (prevents rate-limit cascades).
   */
  async getReconciliation(
    userId: string,
    storeId: string,
    opts: { dateFrom?: number; dateTo?: number; force?: boolean } = {},
  ) {
    const dateFrom = opts.dateFrom;
    const dateTo = opts.dateTo;
    const cacheKey = `${storeId}:${dateFrom ?? 'all'}:${dateTo ?? 'all'}`;
    const diskPath = this.diskCachePath(storeId, dateFrom, dateTo);

    // ─── Layer 1: In-memory cache ──────────────────────────────────────────
    if (!opts.force) {
      const cached = this.reconCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < this.RECON_CACHE_TTL_MS) {
        return { ...cached.payload, _cached: 'memory', _cachedAt: cached.fetchedAt };
      }
      const inflight = this.reconInflight.get(cacheKey);
      if (inflight) return inflight;
    }

    // ─── Layer 2: Disk cache (fresh hit) ──────────────────────────────────
    if (!opts.force) {
      const disk = await this.readDiskCache(diskPath);
      if (disk && Date.now() - disk.fetchedAt < this.diskCacheTtlMs) {
        this.reconCache.set(cacheKey, disk);
        this.logger.log(`Disk cache HIT (fresh): ${path.basename(diskPath)}`);
        return { ...disk.payload, _cached: 'disk', _cachedAt: disk.fetchedAt };
      }
    }

    // ─── Layer 3: Live fetch (with stale-disk fallback on error) ──────────
    const work = (async () => {
      try {
        const payload = await this.fetchReconciliation(userId, storeId, dateFrom, dateTo);
        this.reconCache.set(cacheKey, { fetchedAt: Date.now(), payload });
        // Fire-and-forget disk write — don't block the response.
        this.writeDiskCache(diskPath, payload).catch(() => {});
        return payload;
      } catch (err: any) {
        // On API failure, fall back to ANY disk cache (even if expired)
        const disk = await this.readDiskCache(diskPath);
        if (disk) {
          const ageH = ((Date.now() - disk.fetchedAt) / (60 * 60 * 1000)).toFixed(1);
          this.logger.warn(
            `Live fetch failed (${err?.message}). Serving stale disk cache (age ${ageH}h).`,
          );
          return { ...disk.payload, _cached: 'disk-stale', _cachedAt: disk.fetchedAt, _fallbackReason: err?.message };
        }
        throw err;
      }
    })();

    this.reconInflight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.reconInflight.delete(cacheKey);
    }
  }

  /**
   * FBS orderlardan balans hisoblash - CREATED dan COMPLETED gacha barcha statuslar
   */
  private async getFbsBalance(userId: string, storeId: string, dateFrom: number, dateTo: number): Promise<{
    currentBalance: number;
    ordersByStatus: Record<string, { count: number; profit: number; logistics: number; total: number }>;
  }> {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    // FBS statuslari (rasmda ko'rsatilganlar)
    const fbsStatuses = [
      'CREATED',
      'PACKING',
      'PENDING_DELIVERY',
      'DELIVERING',
      'DELIVERED',
      'ACCEPTED_AT_DP',
      'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
      'COMPLETED',
    ];

    const ordersByStatus: Record<string, { count: number; profit: number; logistics: number; total: number }> = {};
    let currentBalance = 0;

    for (const status of fbsStatuses) {
      try {
        await new Promise(r => setTimeout(r, 150));
        const orders = await this.uzumClient.getAllFbsOrders(
          storeId,
          apiKey,
          uzumShopId,
          [status],
          dateFrom,
          dateTo,
        );

        if (orders.length === 0) continue;

        ordersByStatus[status] ||= { count: 0, profit: 0, logistics: 0, total: 0 };
        ordersByStatus[status].count += orders.length;

        for (const order of orders) {
          // FBS order structure - sellerProfit va logisticDeliveryFee bo'lishi mumkin
          const sellerProfit = Number(order.sellerProfit || order.profit || 0);
          const logistics = Number(order.logisticDeliveryFee || order.logistics || order.deliveryFee || 0);
          const total = sellerProfit + logistics;

          currentBalance += total;
          ordersByStatus[status].profit += sellerProfit;
          ordersByStatus[status].logistics += logistics;
          ordersByStatus[status].total += total;
        }

        this.logger.log(`FBS status=${status} orders=${orders.length} balance=${ordersByStatus[status].total}`);
      } catch (err: any) {
        this.logger.warn(`FBS status=${status} failed: ${err?.message}`);
      }
    }

    return { currentBalance, ordersByStatus };
  }

  private async fetchReconciliation(userId: string, storeId: string, dateFrom: number | undefined, dateTo: number | undefined) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    // Default to 2 years back if dates not provided (optional according to Swagger)
    const toMs = dateTo ?? Date.now();
    const fromMs = dateFrom ?? (Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Reconciliation FETCH for store=${storeId} shop=${uzumShopId} from=${new Date(fromMs).toISOString()} to=${new Date(toMs).toISOString()}`,
    );

    // Try Uzum finance APIs; if forbidden (no permission scope), fall back to local DB.
    const dataSources: { orders: 'uzum' | 'local' | 'none'; expenses: 'uzum' | 'local' | 'none'; errors: string[] } = {
      orders: 'none',
      expenses: 'none',
      errors: [],
    };

    let orderItems: any[] = [];
    let expenses: any[] = [];

    try {
      orderItems = await this.uzumClient.getAllFinanceOrders(storeId, apiKey, [uzumShopId], fromMs, toMs);
      dataSources.orders = 'uzum';
    } catch (err: any) {
      const msg = err?.message || 'finance/orders failed';
      this.logger.warn(`Uzum finance/orders failed (${msg}) — falling back to local DB orders`);
      dataSources.errors.push(`finance/orders: ${msg}`);
      // Fall back to locally-synced FBS orders. They have subtotal/commission/deliveryFee.
      const localOrders = await this.prisma.order.findMany({
        where: {
          storeId,
          orderedAt: { gte: new Date(fromMs), lte: new Date(toMs) },
          status: { notIn: ['CANCELED', 'PENDING_CANCELLATION'] },
        },
        select: { subtotal: true, commission: true, deliveryFee: true, total: true, status: true, orderedAt: true },
      });
      // Map local orders into the same shape as Uzum's finance/orders so the rest of the
      // pipeline (sales aggregation, byStatus grouping) works unchanged.
      orderItems = localOrders.map((o) => ({
        amount: Number(o.subtotal),                                              // gross product price
        commission: Number(o.commission),
        transfer: Number(o.total) - Number(o.commission) - Number(o.deliveryFee), // net to seller
        status: o.status,
        orderDate: o.orderedAt?.toISOString(),
      }));
      if (localOrders.length > 0) dataSources.orders = 'local';
    }

    try {
      expenses = await this.uzumClient.getAllExpenses(storeId, apiKey, [uzumShopId], fromMs, toMs);
      dataSources.expenses = 'uzum';
      this.logger.log(`Uzum /v1/finance/expenses returned ${expenses.length} items`);
    } catch (err: any) {
      const msg = err?.message || 'finance/expenses failed';
      this.logger.warn(`Uzum finance/expenses failed (${msg}) — falling back to local DB expenses`);
      dataSources.errors.push(`finance/expenses: ${msg}`);
      const localExpenses = await this.prisma.expense.findMany({
        where: {
          storeId,
          date: { gte: new Date(fromMs), lte: new Date(toMs) },
          deletedAt: null,
        },
        select: { id: true, category: true, description: true, amount: true, date: true, source: true, uzumRef: true },
      });
      expenses = localExpenses.map((e) => ({
        id: e.id,
        type: e.category,
        description: e.description,
        amount: Number(e.amount),
        date: e.date?.toISOString(),
        source: e.source,
        requestId: e.uzumRef,
      }));
      if (localExpenses.length > 0) dataSources.expenses = 'local';
    }

    // ─── Sales side ────────────────────────────────────────────────────────
    // "Hozirgi balans" = TO_WITHDRAW + PROCESSING statusdagi buyurtmalarning
    // sellerProfit + logisticDeliveryFee yig'indisi. Boshqa statuslar (CONFIRMED, etc.)
    // allaqachon yechib olingan, balansga kiritilmaydi.
    // Real Uzum /v1/finance/orders item shape (verified against live API):
    //   - sellPrice          = price per unit (so'm, NOT tiyin)
    //   - amount             = number of units sold (count, NOT money!)
    //   - amountReturns      = number of units returned (subtract from amount for net qty)
    //   - commission         = Uzum's commission amount (so'm)
    //   - logisticDeliveryFee = logistics/delivery fee Uzum took (so'm)
    //   - sellerProfit       = net amount credited to seller (= sellPrice*amount − commission − logisticDeliveryFee)
    //   - withdrawnProfit    = how much of this order's profit has been paid out
    //   - status             = "TO_WITHDRAW" | "PROCESSING" | "CONFIRMED" | "CANCELLED" | ...
    //   - date               = ms timestamp
    let grossRevenue = 0;
    let totalCommission = 0;
    let totalLogistics = 0;
    let totalTransfer = 0;
    let ordersCount = 0;
    // Hozirgi balans: faqat TO_WITHDRAW va PROCESSING statusdagi buyurtmalar
    let currentBalance = 0;
    const ordersByStatus: Record<string, { count: number; transfer: number; commission: number; gross: number; logistics: number }> = {};

    for (const o of orderItems) {
      const sellPrice = Number(o.sellPrice || 0);
      const qty = Number(o.amount || 0);
      const returnsQty = Number(o.amountReturns || 0);
      const netQty = Math.max(0, qty - returnsQty); // exclude returned units
      const gross = sellPrice * netQty;
      const commission = Number(o.commission || 0);
      const logistics = Number(o.logisticDeliveryFee || 0);
      // Use sellerProfit if available — most reliable. Fall back to computed value.
      const transfer = o.sellerProfit != null
        ? Number(o.sellerProfit)
        : Math.max(0, gross - commission - logistics);
      grossRevenue += gross;
      totalCommission += commission;
      totalLogistics += logistics;
      totalTransfer += transfer;
      ordersCount++;

      // Hozirgi balans: TO_WITHDRAW va PROCESSING statusdagi buyurtmalar uchun
      // sellerProfit + logisticDeliveryFee yig'indisi hisoblanadi
      const st = String(o.status || 'UNKNOWN').toUpperCase();
      if (st === 'TO_WITHDRAW' || st === 'PROCESSING') {
        currentBalance += transfer + logistics;
      }

      ordersByStatus[st] ||= { count: 0, transfer: 0, commission: 0, gross: 0, logistics: 0 };
      ordersByStatus[st].count++;
      ordersByStatus[st].transfer += transfer;
      ordersByStatus[st].commission += commission;
      ordersByStatus[st].gross += gross;
      ordersByStatus[st].logistics += logistics;
    }

    // ─── Expenses side ─────────────────────────────────────────────────────
    // Uzum's /v1/finance/expenses returns items with shape (verified against live API):
    //   - paymentPrice = the actual money amount (in so'm, NOT tiyin)
    //   - amount       = number of UNITS (count), NOT money
    //   - type         = "OUTCOME" | "INCOME" (direction is explicit, no heuristic needed)
    //   - source       = human category ("Logistika", "Komissiya", "Vyvod", etc.)
    //   - status       = "CONFIRMED" | ... (transaction state)
    //   - name         = full description
    //   - dateCreated  = ms timestamp
    //   - externalId   = order/withdrawal reference
    const withdrawals: Array<{
      id: string;
      uzumRef?: string;
      amount: number;
      date: number | null;
      description: string;
      type: string;
      status?: string;
    }> = [];
    const fines: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      date: number | null;
      status?: string;
    }> = [];
    type ServiceItem = {
      id: string;
      type: string;
      description: string;
      amount: number;            // always positive
      direction: 'income' | 'outcome';
      date: number | null;
      status: string;
    };
    const services: ServiceItem[] = [];
    const otherExpenses: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      date: number | null;
      status?: string;
    }> = [];

    // Group by source so the UI can show "what categories of expenses Uzum reported"
    const expensesByType: Record<string, { count: number; total: number; sample?: string }> = {};

    for (const e of expenses) {
      // Verified field mapping from live API:
      // paymentPrice = PER-UNIT money (so'm); e.amount = quantity → real charge = price × qty.
      // Local-DB fallback rows have no paymentPrice and store the money directly in `amount`.
      const amount = e.paymentPrice != null
        ? Math.abs(Number(e.paymentPrice)) * (Number(e.amount ?? 1) || 1)
        : Math.abs(Number(e.amount ?? 0));
      const source = String(e.source || 'UNKNOWN');
      const description = String(e.name || e.description || e.comment || source);
      const status = String(e.status || 'UNKNOWN').toUpperCase();
      const directionRaw = String(e.type || '').toUpperCase();
      const isIncomeApi = directionRaw === 'INCOME';
      const dateMs = e.dateCreated
        ? Number(e.dateCreated)
        : e.date
          ? new Date(e.date).getTime()
          : null;
      // Try to extract a numeric reference (e.g. withdrawal #5000065932)
      const refMatch = description.match(/#?(\d{6,})/);
      const uzumRef = e.externalId || e.requestId || e.requestNumber || refMatch?.[1];

      // Group by source (the Uzum-provided category) for the type-breakdown card
      expensesByType[source] ||= { count: 0, total: 0, sample: description };
      expensesByType[source].count++;
      expensesByType[source].total += amount;

      // Heuristic helpers still useful for non-standard source values
      const ctx = { type: source, description, source: e.source };

      if (isWithdrawal(ctx)) {
        withdrawals.push({
          id: String(e.id ?? `${source}-${dateMs}-${amount}`),
          uzumRef: uzumRef != null ? String(uzumRef) : undefined,
          amount,
          date: dateMs,
          description,
          type: source,
          status,
        });
      } else if (isFine(ctx)) {
        fines.push({
          id: String(e.id ?? `${source}-${dateMs}-${amount}`),
          type: source,
          description,
          amount,
          date: dateMs,
          status,
        });
      } else if (isService(ctx)) {
        services.push({
          id: String(e.id ?? `${source}-${dateMs}-${amount}`),
          type: source,
          description,
          amount,
          // Trust Uzum's explicit type field when present; fall back to keyword detection
          direction: isIncomeApi ? 'income' : directionRaw === 'OUTCOME' ? 'outcome' : isIncome(ctx) ? 'income' : 'outcome',
          date: dateMs,
          status,
        });
      } else {
        otherExpenses.push({
          id: String(e.id ?? `${source}-${dateMs}-${amount}`),
          type: source,
          description,
          amount,
          date: dateMs,
          status,
        });
      }
    }

    const withdrawalTotal = withdrawals.reduce((s, w) => s + w.amount, 0);
    const finesTotal = fines.reduce((s, f) => s + f.amount, 0);
    const otherExpensesTotal = otherExpenses.reduce((s, o) => s + o.amount, 0);

    // ─── Service payments: aggregate by direction + status ─────────────────
    const servicesIncome = services.filter((s) => s.direction === 'income').reduce((s, x) => s + x.amount, 0);
    const servicesOutcome = services.filter((s) => s.direction === 'outcome').reduce((s, x) => s + x.amount, 0);
    const servicesNet = servicesOutcome - servicesIncome; // positive = money out, negative = net income

    const servicesByStatus: Record<string, { count: number; income: number; outcome: number; net: number }> = {};
    for (const s of services) {
      servicesByStatus[s.status] ||= { count: 0, income: 0, outcome: 0, net: 0 };
      servicesByStatus[s.status].count++;
      if (s.direction === 'income') servicesByStatus[s.status].income += s.amount;
      else servicesByStatus[s.status].outcome += s.amount;
      servicesByStatus[s.status].net =
        servicesByStatus[s.status].outcome - servicesByStatus[s.status].income;
    }

    // ─── P&L: profit calculation ───────────────────────────────────────────
    // Net profit ("toza foyda") = what we actually earned after Uzum took its cuts AND
    // we paid the platform's other expenses + fines + service net. Withdrawals are
    // NOT subtracted — those are money we *took out*, not money we *lost*.
    const netProfit = totalTransfer - otherExpensesTotal - finesTotal - servicesNet;
    const netProfitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    // ─── Balance reconciliation ────────────────────────────────────────────
    // Hozirgi balans: FBS orderlardan (CREATED -> COMPLETED statuslari)
    // sellerProfit + logisticDeliveryFee yig'indisi
    const fbsBalance = await this.getFbsBalance(userId, storeId, fromMs, toMs);
    const computedBalance = fbsBalance.currentBalance;

    // FBS orders byStatus ni asosiy ordersByStatus ga qo'shish
    for (const [status, agg] of Object.entries(fbsBalance.ordersByStatus)) {
      ordersByStatus[status] ||= { count: 0, transfer: 0, commission: 0, gross: 0, logistics: 0 };
      ordersByStatus[status].count += agg.count;
      ordersByStatus[status].logistics += agg.logistics;
      ordersByStatus[status].transfer += agg.profit;
    }

    // Sort newest first
    withdrawals.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    fines.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    services.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    otherExpenses.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

    return {
      dateFrom: fromMs,
      dateTo: toMs,
      dataSources, // tells the UI whether numbers came from Uzum live or local DB fallback
      sales: {
        ordersCount,
        grossRevenue,
        totalCommission,
        totalLogistics,
        totalTransfer,
        avgOrderValue: ordersCount > 0 ? grossRevenue / ordersCount : 0,
        commissionRate: grossRevenue > 0 ? (totalCommission / grossRevenue) * 100 : 0,
        logisticsRate: grossRevenue > 0 ? (totalLogistics / grossRevenue) * 100 : 0,
        byStatus: ordersByStatus,
      },
      withdrawals: {
        list: withdrawals,
        total: withdrawalTotal,
        count: withdrawals.length,
      },
      fines: {
        list: fines,
        total: finesTotal,
        count: fines.length,
      },
      // Service payments (logistics, delivery, packaging, fulfillment, storage…)
      // from /v1/finance/expenses, split into income (refunds) vs outcome (deductions)
      // and grouped by Uzum's status field.
      services: {
        list: services,
        totalIncome: servicesIncome,
        totalOutcome: servicesOutcome,
        net: servicesNet,
        count: services.length,
        byStatus: servicesByStatus,
      },
      otherExpenses: {
        list: otherExpenses,
        total: otherExpensesTotal,
        count: otherExpenses.length,
      },
      // Expose raw type grouping so user can verify our heuristic / spot mis-categorized rows
      expensesByType: Object.entries(expensesByType)
        .map(([type, v]) => {
          const blob = `${type} ${v.sample || ''}`.toLowerCase();
          const classified: 'withdrawal' | 'fine' | 'service' | 'other' = WITHDRAWAL_KEYWORDS.some(kw => blob.includes(kw))
            ? 'withdrawal'
            : FINE_KEYWORDS.some(kw => blob.includes(kw))
              ? 'fine'
              : SERVICE_KEYWORDS.some(kw => blob.includes(kw))
                ? 'service'
                : 'other';
          return { type, count: v.count, total: v.total, sample: v.sample, classified };
        })
        .sort((a, b) => b.total - a.total),
      // P&L summary: pure profitability (excludes withdrawals; includes fines as losses)
      profit: {
        gross: grossRevenue,
        netAfterUzumCuts: totalTransfer,           // after commission + logistics
        netProfit,                                  // after platform expenses + fines
        netProfitMargin,                            // %
      },
      balance: {
        computed: computedBalance,
        formula: 'balance = SUM(FBS orderlarning sellerProfit + logisticDeliveryFee) - CREATED → COMPLETED',
        breakdown: {
          fbsOrdersByStatus: fbsBalance.ordersByStatus,
          totalBalance: computedBalance,
        },
      },
    };
  }

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
