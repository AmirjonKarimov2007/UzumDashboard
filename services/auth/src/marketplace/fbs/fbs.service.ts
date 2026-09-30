import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { FinanceSyncService } from '../finance/finance-sync.service';
import { SmartupService } from './smartup.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../common/database/prisma.service';
import { RequestCache } from '../../common/utils/request-cache';

const PRODUCT_FILTERS = new Set([
  'ALL',
  'ACTIVE',
  'INACTIVE',
  'WARNING',
  'WITH_SKU',
  'ARCHIVE',
  'DEFECTED',
  'WITHOUT_REQUIRED_FILTERS',
]);

const PRODUCT_SORTS = new Set([
  'DEFAULT',
  'ORDERS',
  'PRICE',
  'ID',
  'ROI',
  'CONVERSION',
  'LEFTOVERS',
  'CREATED_AND_TITLE',
]);

type ProductCatalog = { products: any[]; total: number };

@Injectable()
export class FbsService {
  private readonly reads = new RequestCache();
  private readonly labels = new RequestCache(80);
  private readonly logger = new Logger(FbsService.name);
  // Per-store in-memory cache for counts (60s TTL)
  private countsCache = new Map<string, { data: Record<string, number>; expiresAt: number }>();
  // Stale-while-revalidate cache for live product lists (avoids blocking on Uzum)
  private productsCache = new Map<string, { fetchedAt: number; payload: any }>();
  private productsInflight = new Map<string, Promise<any>>();
  private productCatalogCache = new Map<string, { fetchedAt: number; payload: ProductCatalog }>();
  private productCatalogInflight = new Map<string, Promise<ProductCatalog>>();
  private readonly PRODUCTS_TTL_MS = 2 * 60 * 1000;
  // Mahsulotlar analitikasi keshi (5 daqiqa) — barcha mahsulotlarni tortib agregatlaydi
  private productAnalyticsCache = new Map<string, { fetchedAt: number; payload: any }>();
  private readonly PRODUCT_ANALYTICS_TTL_MS = 5 * 60 * 1000;
  private readonly fbsCacheDir = path.join(process.cwd(), '.cache', 'fbs');
  private readonly acceptedInvoiceOrderStatuses = [
    'COMPLETED',
    'RETURNED',
    'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
    'ACCEPTED_AT_DP',
    'DELIVERING',
    'DELIVERED',
  ];

  constructor(
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
    private readonly financeSync: FinanceSyncService,
    private readonly smartup: SmartupService,
    private readonly prisma?: PrismaService,
  ) {}

  async getOrders(
    userId: string,
    storeId: string,
    status: string = 'PACKING',
    page: number = 0,
    size: number = 50,
    extra: { scheme?: 'FBS' | 'DBS'; dateFrom?: number; dateTo?: number } = {},
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const key = `${storeId}:orders:${userId}:${status}:${page}:${size}:${JSON.stringify(extra)}`;
    return this.reads.get(key, 5_000, () => this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size, extra));
  }

  async getAllOrders(
    userId: string,
    storeId: string,
    statuses: string[] = ['CREATED', 'PACKING', 'RETURNED'],
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const orders = await this.uzumClient.getAllFbsOrders(storeId, apiKey, uzumShopId, statuses);
    return { count: orders.length, orders };
  }

  async getLabelPdf(
    userId: string,
    storeId: string,
    orderId: number | string,
    size: 'LARGE' | 'SMALL' = 'LARGE',
  ): Promise<Buffer | null> {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const base64 = await this.cachedLabel(storeId, apiKey, orderId, size);
    if (!base64) return null;
    return Buffer.from(base64, 'base64');
  }

  async getLiveProducts(
    userId: string,
    storeId: string,
    page: number = 0,
    size: number = 50,
    filter?: string,
    searchQuery?: string,
    sortBy?: string,
    order?: 'ASC' | 'DESC' | 'asc' | 'desc',
    costFilter?: string,
    xidFilter?: string,
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const safePage = Math.max(0, Number(page) || 0);
    const safeSize = Math.min(2000, Math.max(1, Number(size) || 50));
    const requestedFilter = String(filter || 'ALL').toUpperCase();
    const normalizedFilter = PRODUCT_FILTERS.has(requestedFilter) ? requestedFilter : 'ALL';
    const requestedSort = String(sortBy || 'CREATED_AND_TITLE').toUpperCase();
    const normalizedSortBy = PRODUCT_SORTS.has(requestedSort) ? requestedSort : 'CREATED_AND_TITLE';
    const normalizedOrder = String(order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const normalizedSearch = String(searchQuery || '').trim();
    const normalizedCostFilter = String(costFilter || '').toUpperCase() === 'MISSING' ? 'MISSING' : undefined;
    const normalizedXidFilter = String(xidFilter || '').toUpperCase() === 'MISSING' ? 'MISSING' : undefined;
    // Local metadata predicates must be applied before pagination, over the
    // complete catalog. Read metadata afresh so saved cost/XID values update filters.
    if (normalizedCostFilter || normalizedXidFilter || normalizedSearch) {
      const [catalog, meta] = await Promise.all([
        this.getProductCatalog(userId, storeId, uzumShopId, apiKey, normalizedFilter, ''),
        this.prisma!.productMeta.findMany({ where: { storeId }, select: { skuId: true, costPrice: true, articleCode: true, xid: true } }),
      ]);
      const bySku = new Map(meta.map((row) => [row.skuId, row]));
      const q = normalizedSearch.toLocaleLowerCase();
      const filtered = catalog.products.filter((product) => {
        const skus: any[] = product.skuList || [];
        const missingCost = skus.length > 0 && skus.some((sku) => bySku.get(String(sku.skuId))?.costPrice == null);
        const missingXid = skus.length > 0 && skus.some((sku) => !bySku.get(String(sku.skuId))?.xid?.trim());
        const matches = !q || [product.title, product.productId, ...skus.flatMap((sku) => {
          const row = bySku.get(String(sku.skuId));
          return [sku.skuId, sku.skuTitle, sku.skuFullTitle, sku.barcode, row?.articleCode, row?.xid];
        })].some((value) => String(value ?? '').toLocaleLowerCase().includes(q));
        return matches
          && (!normalizedCostFilter || missingCost)
          && (!normalizedXidFilter || missingXid);
      });
      filtered.sort((a, b) => {
        const metric = (product: any) => {
          const skus = product.skuList || [];
          if (normalizedSortBy === 'PRICE') return Number(skus[0]?.price || 0);
          if (normalizedSortBy === 'ORDERS') return skus.reduce((sum: number, sku: any) => sum + Number(sku.quantitySold || 0), 0);
          if (normalizedSortBy === 'LEFTOVERS') return skus.reduce((sum: number, sku: any) => sum + Number(sku.quantityActive || 0) + Number(sku.quantityFbs || 0), 0);
          return null;
        };
        const left = metric(a), right = metric(b);
        const diff = left != null && right != null ? left - right : this.compareProductIds(a.productId, b.productId);
        return normalizedOrder === 'DESC' ? -diff : diff;
      });
      return { products: filtered.slice(safePage * safeSize, (safePage + 1) * safeSize), total: filtered.length, page: safePage, size: safeSize };
    }
    const key = `${userId}:${storeId}:${safePage}:${safeSize}:${normalizedFilter}:${normalizedSearch}:${normalizedSortBy}:${normalizedOrder}`;
    const produce = async () => {
      // Uzum currently returns the same order for CREATED_AND_TITLE ASC and DESC.
      // Fetch the filtered catalog once, then sort it deterministically by productId
      // (Uzum product IDs are monotonic) so the newest product is always first.
      if (normalizedSortBy === 'CREATED_AND_TITLE' || normalizedSortBy === 'ID') {
        const catalog = await this.getProductCatalog(
          userId,
          storeId,
          uzumShopId,
          apiKey,
          normalizedFilter,
          normalizedSearch,
        );
        const products = [...catalog.products].sort((a, b) => {
          const byId = this.compareProductIds(a?.productId, b?.productId);
          if (byId !== 0) return normalizedOrder === 'DESC' ? -byId : byId;
          const byTitle = String(a?.title || '').localeCompare(String(b?.title || ''), 'uz');
          return normalizedOrder === 'DESC' ? -byTitle : byTitle;
        });
        const offset = safePage * safeSize;
        return {
          products: products.slice(offset, offset + safeSize),
          total: catalog.total,
          page: safePage,
          size: safeSize,
        };
      }

      return this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
        page: safePage,
        size: safeSize,
        filter: normalizedFilter,
        searchQuery: normalizedSearch || undefined,
        sortBy: normalizedSortBy,
        order: normalizedOrder,
      });
    };
    const run = () => {
      const existing = this.productsInflight.get(key);
      if (existing) return existing;
      const p = produce()
        .then((payload) => { this.productsCache.set(key, { fetchedAt: Date.now(), payload }); return payload; })
        .finally(() => this.productsInflight.delete(key));
      this.productsInflight.set(key, p);
      return p;
    };

    const cached = this.productsCache.get(key);
    if (cached) {
      // Stale-while-revalidate: return instantly, refresh in background if stale.
      if (Date.now() - cached.fetchedAt >= this.PRODUCTS_TTL_MS && !this.productsInflight.has(key)) {
        void run().catch((e) => this.logger.warn(`Products bg refresh failed: ${e?.message}`));
      }
      return cached.payload;
    }
    return run();
  }

  private async getProductCatalog(
    userId: string,
    storeId: string,
    uzumShopId: string | number,
    apiKey: string,
    filter: string,
    searchQuery: string,
  ): Promise<ProductCatalog> {
    const key = `${userId}:${storeId}:${filter}:${searchQuery}`;
    const cached = this.productCatalogCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.PRODUCTS_TTL_MS) return cached.payload;

    const inflight = this.productCatalogInflight.get(key);
    if (inflight) return inflight;

    const request = (async () => {
      const pageSize = 2000;
      const first = await this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
        page: 0,
        size: pageSize,
        filter,
        searchQuery: searchQuery || undefined,
        sortBy: 'CREATED_AND_TITLE',
        order: 'ASC',
      });
      const products = [...first.products];
      const totalPages = Math.ceil(first.total / pageSize);

      // Keep calls sequential and lightly spaced to avoid unnecessary API/server load.
      for (let pageNumber = 1; pageNumber < totalPages; pageNumber += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const next = await this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
          page: pageNumber,
          size: pageSize,
          filter,
          searchQuery: searchQuery || undefined,
          sortBy: 'CREATED_AND_TITLE',
          order: 'ASC',
        });
        if (!next.products.length) break;
        products.push(...next.products);
      }

      const payload = { products, total: first.total };
      this.productCatalogCache.set(key, { fetchedAt: Date.now(), payload });
      return payload;
    })().finally(() => this.productCatalogInflight.delete(key));

    this.productCatalogInflight.set(key, request);
    return request;
  }

  private compareProductIds(left: unknown, right: unknown): number {
    try {
      const a = BigInt(String(left ?? ''));
      const b = BigInt(String(right ?? ''));
      return a === b ? 0 : a < b ? -1 : 1;
    } catch {
      return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
    }
  }

  async getLiveFinanceOrders(
    userId: string,
    storeId: string,
    page: number = 0,
    size: number = 50,
    dateFrom?: number,
    dateTo?: number,
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { orderItems, total } = await this.uzumClient.getFinanceOrders(
      storeId, apiKey, [uzumShopId], { page, size, dateFrom, dateTo },
    );
    return { orderItems, total, page, size };
  }

  // Bitta kalit uchun parallel yangilashlarni deduplikatsiya qilish
  private countsInflight = new Map<string, Promise<Record<string, number>>>();

  /** Counts across all FBS statuses with 60s cache.
   *  Stale-while-revalidate: muddati o'tgan kesh darhol qaytariladi (tab
   *  badge'lari bir zumda chiqadi), yangilash fonda ketadi. */
  async getOrderCounts(
    userId: string,
    storeId: string,
    dateFrom?: number,
    dateTo?: number,
  ) {
    await this.storesService.getStoreCredentials(userId, storeId);
    const cacheKey = `${userId}:${storeId}:${dateFrom ?? ''}:${dateTo ?? ''}`;
    const cached = this.countsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (cached) {
      // Eski (muddati o'tgan) qiymatni darhol qaytarib, fonda yangilaymiz
      if (!this.countsInflight.has(cacheKey)) {
        void this.refreshOrderCounts(userId, storeId, cacheKey, dateFrom, dateTo).catch(
          (e) => this.logger.warn(`Counts bg refresh failed: ${e?.message}`),
        );
      }
      return cached.data;
    }
    return this.refreshOrderCounts(userId, storeId, cacheKey, dateFrom, dateTo);
  }

  private refreshOrderCounts(
    userId: string,
    storeId: string,
    cacheKey: string,
    dateFrom?: number,
    dateTo?: number,
  ): Promise<Record<string, number>> {
    const existing = this.countsInflight.get(cacheKey);
    if (existing) return existing;

    const run = (async () => {
      const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
      const statuses = [
        'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
        'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
        'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
      ];
      const prev = this.countsCache.get(cacheKey)?.data;
      const result: Record<string, number> = {};
      // 3 talik parallel partiyalar + 200ms oraliq — token bucketga sig'adi,
      // sovuq yuklash ~6s dan ~1.5s ga tushadi. 429 bo'lsa client ichida retry bor.
      const CHUNK = 3;
      for (let i = 0; i < statuses.length; i += CHUNK) {
        const chunk = statuses.slice(i, i + CHUNK);
        const counts = await Promise.all(
          chunk.map((status) =>
            this.uzumClient.getFbsOrderCount(storeId, apiKey, uzumShopId, status, dateFrom, dateTo),
          ),
        );
        chunk.forEach((status, k) => {
          const n = counts[k];
          // Xato bo'lsa noto'g'ri 0 ko'rsatmaymiz — oxirgi ma'lum qiymat qoladi
          result[status] = n != null ? n : prev?.[status] ?? 0;
        });
        if (i + CHUNK < statuses.length) await new Promise((r) => setTimeout(r, 200));
      }
      this.countsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
      return result;
    })().finally(() => this.countsInflight.delete(cacheKey));

    this.countsInflight.set(cacheKey, run);
    return run;
  }

  async getOrdersAdvanced(
    userId: string,
    storeId: string,
    params: {
      status?: string;
      page?: number;
      size?: number;
      dateFrom?: number;
      dateTo?: number;
      scheme?: 'FBS' | 'DBS';
    },
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { status = 'CREATED', page = 0, size = 20, dateFrom, dateTo, scheme } = params;
    const queryParams: Record<string, unknown> = { shopIds: uzumShopId, status, page, size };
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;
    if (scheme) queryParams.scheme = scheme;

    const data = await this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size);
    return { orders: data.orders, page, size, status };
  }

  async confirmOrder(userId: string, storeId: string, orderId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const result = await this.uzumClient.confirmFbsOrder(storeId, apiKey, orderId);
    // Keshni o'chirmaymiz — muddati o'tgan deb belgilaymiz. Keyingi so'rov eski
    // qiymatni darhol oladi (SWR), yangilash fonda ketadi; badge qotib qolmaydi.
    this.expireCounts();
    return result;
  }

  /** Counts keshini "eskirgan" deb belgilaydi (o'chirmaydi) — SWR uchun. */
  private expireCounts() {
    this.reads.invalidate();
    this.labels.invalidate();
    for (const entry of this.countsCache.values()) entry.expiresAt = 0;
  }

  /** Buyurtmani bekor qilish. reason — Uzum bekor qilish sabablaridan biri. */
  async cancelOrder(userId: string, storeId: string, orderId: number | string, reason: string, comment?: string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const result = await this.uzumClient.cancelFbsOrder(storeId, apiKey, orderId, reason, comment);
    this.expireCounts();
    return result;
  }

  /** Buyurtma pozitsiyalariga identifikator (IMEI / ASL belgisi) biriktirish. */
  async setOrderIdentifiers(
    userId: string,
    storeId: string,
    orderId: number | string,
    items: Array<{ orderItemId: number; values: string[] }>,
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.setFbsOrderIdentifiers(storeId, apiKey, orderId, items);
  }

  /** Bekor qilish / qaytarish sabablari ro'yxati (60 daqiqa keshlanadi). */
  private returnReasonsCache = new Map<string, { fetchedAt: number; data: any[] }>();
  async getReturnReasons(userId: string, storeId: string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const cached = this.returnReasonsCache.get(storeId);
    if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.data;
    const data = await this.uzumClient.getFbsReturnReasons(storeId, apiKey);
    this.returnReasonsCache.set(storeId, { fetchedAt: Date.now(), data });
    return data;
  }

  // ─── DBS amallari ────────────────────────────────────────────────────
  async dbsDelivering(userId: string, storeId: string, orderId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const r = await this.uzumClient.dbsOrderDelivering(storeId, apiKey, orderId);
    this.expireCounts();
    return r;
  }
  async dbsCompleted(userId: string, storeId: string, orderId: number | string, issueCode?: number) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const r = await this.uzumClient.dbsOrderCompleted(storeId, apiKey, orderId, issueCode);
    this.expireCounts();
    return r;
  }
  async dbsRefund(userId: string, storeId: string, orderId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const r = await this.uzumClient.dbsOrderRefund(storeId, apiKey, orderId);
    this.expireCounts();
    return r;
  }

  // ─── Narx tahrirlash ─────────────────────────────────────────────────
  /** SKU narxlarini o'zgartirish. Keyin live-products keshini tozalaydi. */
  async updatePrices(
    userId: string,
    storeId: string,
    productId: number,
    skuList: Array<{ skuId: number; fullPrice?: number; sellPrice?: number; skuTitle?: string }>,
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const result = await this.uzumClient.sendPriceData(storeId, apiKey, uzumShopId, productId, skuList);
    if (result.ok) {
      const cachePrefix = `${userId}:${storeId}:`;
      for (const key of this.productsCache.keys()) {
        if (key.startsWith(cachePrefix)) this.productsCache.delete(key);
      }
      for (const key of this.productCatalogCache.keys()) {
        if (key.startsWith(cachePrefix)) this.productCatalogCache.delete(key);
      }
      this.productAnalyticsCache.delete(storeId);
    }
    return result;
  }

  // ─── Dalolatnoma / akt PDF ───────────────────────────────────────────
  /** Ta'minlash akti (yuborish dalolatnomasi) PDF — Buffer yoki null. */
  async getInvoiceActPdf(userId: string, storeId: string, invoiceId: number | string): Promise<Buffer | null> {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const base64 = await this.uzumClient.getFbsInvoiceActPdf(storeId, apiKey, invoiceId);
    return base64 ? Buffer.from(base64, 'base64') : null;
  }
  /** Qabul akti (closing/priyomka) PDF — Buffer yoki null. */
  async getInvoiceClosingPdf(userId: string, storeId: string, invoiceId: number | string): Promise<Buffer | null> {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const base64 = await this.uzumClient.getFbsInvoiceClosingDocsPdf(storeId, apiKey, invoiceId);
    return base64 ? Buffer.from(base64, 'base64') : null;
  }

  // ─── Ta'minlash: yaratish / bekor / drop-off / time-slot ─────────────
  async cancelInvoice(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.cancelFbsInvoice(storeId, apiKey, invoiceId);
  }
  async getInvoiceDropOffPoints(userId: string, storeId: string, orderIds: (number | string)[]) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsInvoiceDropOffPoints(storeId, apiKey, orderIds);
  }
  async getInvoiceTimeSlots(userId: string, storeId: string, dopId: string, orderIds: (number | string)[]) {
    if (!dopId) return [];
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsInvoiceTimeSlots(storeId, apiKey, dopId, orderIds);
  }
  async createInvoice(
    userId: string,
    storeId: string,
    body: { orderIds: Array<number | string>; dropOffPointUuid: string; timeSlotUuid: string; sellerId?: number; idempotencyKey?: string },
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const orderIds = body.orderIds.map((id) => {
      const n = Number(id);
      return Number.isFinite(n) ? n : id;
    });
    const sellerId = body.sellerId ?? Number(uzumShopId);
    const r = await this.uzumClient.createFbsInvoice(storeId, apiKey, {
      ...body,
      orderIds,
      sellerId: Number.isFinite(sellerId) ? sellerId : undefined,
    });
    this.expireCounts();
    return r;
  }

  // ─── Qaytarishlar (Returns) ──────────────────────────────────────────
  async getReturns(userId: string, storeId: string, params: { returnId?: number | string; page?: number; size?: number } = {}) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { returnId, page = 0, size = 50 } = params;
    const returns = returnId
      ? [await this.uzumClient.getSellerReturnById(storeId, apiKey, uzumShopId, returnId)].filter(Boolean)
      : await this.uzumClient.getSellerReturns(storeId, apiKey, uzumShopId, { page, size });
    return { returns };
  }

  // ─── FBO ta'minlash aktlari (SKU tarkibi bilan) ──────────────────────
  async getSupplyInvoices(userId: string, storeId: string, page = 0, size = 50) {
    return this.getFboInvoices(userId, storeId, page, size);
  }

  async getFboInvoices(userId: string, storeId: string, page = 0, size = 20) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const safePage = Math.max(0, Number(page) || 0);
    const safeSize = Math.min(50, Math.max(1, Number(size) || 20));
    const invoices = await this.uzumClient.getSellerInvoices(
      storeId,
      apiKey,
      uzumShopId,
      { page: safePage, size: safeSize },
    );
    const ids = invoices
      .map((invoice: any) => this.fboImportKey(invoice?.id))
      .filter(Boolean);
    const statusMap = await this.smartup.getImportStatus(storeId, ids);

    return {
      invoices: invoices.map((invoice: any) => ({
        ...invoice,
        smartupImport: statusMap[this.fboImportKey(invoice?.id)] || null,
      })),
      page: safePage,
      size: safeSize,
      hasNext: invoices.length === safeSize,
    };
  }

  async getFboInvoiceProducts(userId: string, storeId: string, invoiceId: string) {
    const normalizedInvoiceId = String(invoiceId ?? '').trim();
    if (!normalizedInvoiceId) throw new BadRequestException('FBO nakladnoy ID topilmadi');
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const products = await this.uzumClient.getSellerInvoiceProducts(
      storeId,
      apiKey,
      uzumShopId,
      normalizedInvoiceId,
    );
    const skuIds = [...new Set(this.flattenFboItems(products).map((item) => item.skuId).filter(Boolean))];
    const metadata = this.prisma?.productMeta && skuIds.length
      ? await this.prisma.productMeta.findMany({
        where: { storeId, skuId: { in: skuIds } },
        select: { skuId: true, xid: true },
      })
      : [];
    const xidBySku = new Map(metadata.map((row) => [String(row.skuId), row.xid]));
    const enrichedProducts = products.map((product: any) => ({
      ...product,
      skuForInvoiceDtoList: (product?.skuForInvoiceDtoList || []).map((sku: any) => ({
        ...sku,
        xid: xidBySku.get(String(sku?.id ?? '')) || null,
      })),
      xid: xidBySku.get(String(product?.id ?? '')) || null,
    }));
    const key = this.fboImportKey(normalizedInvoiceId);
    const statusMap = await this.smartup.getImportStatus(storeId, [key]);

    return {
      invoiceId: normalizedInvoiceId,
      products: enrichedProducts,
      smartupImport: statusMap[key] || null,
    };
  }

  async importFboInvoiceToSmartup(userId: string, storeId: string, invoiceId: string) {
    const normalizedInvoiceId = String(invoiceId ?? '').trim();
    if (!normalizedInvoiceId) throw new BadRequestException('FBO nakladnoy ID topilmadi');
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const products = await this.uzumClient.getSellerInvoiceProducts(
      storeId,
      apiKey,
      uzumShopId,
      normalizedInvoiceId,
    );
    const allItems = this.flattenFboItems(products);
    // Planned stock quantities include goods the warehouse never accepted.
    // Missing/invalid acceptance data must block the entire import, not fall
    // back to the planned quantity or silently omit an unknown SKU.
    if (allItems.some((item) => !Number.isInteger(item.quantityAccepted) || item.quantityAccepted < 0)) {
      throw new BadRequestException('FBO qabul qilingan mahsulot miqdori aniqlanmadi. Smartupga hech narsa yuborilmadi.');
    }
    const items = allItems.filter((item) => item.quantityAccepted > 0)
      .map((item) => ({ ...item, amount: item.quantityAccepted }));
    if (!items.length) {
      throw new BadRequestException('FBO nakladnoyda qabul qilingan mahsulot yo‘q. Smartupga hech narsa yuborilmadi.');
    }

    const key = this.fboImportKey(normalizedInvoiceId);
    return this.smartup.importOrder(userId, storeId, {
      id: key,
      orderId: key,
      dateCreated: Date.now(),
      items,
    }, key);
  }

  async checkFboInvoiceInSmartup(userId: string, storeId: string, invoiceId: string) {
    await this.storesService.getStoreCredentials(userId, storeId);
    return this.smartup.checkOrder(storeId, this.fboImportKey(invoiceId));
  }

  private fboImportKey(invoiceId: string | number): string {
    const normalized = String(invoiceId ?? '').trim();
    return normalized ? `FBO:${normalized}` : '';
  }

  private flattenFboItems(products: any[]): any[] {
    return (products || []).flatMap((product: any) => {
      const variants = Array.isArray(product?.skuForInvoiceDtoList)
        && product.skuForInvoiceDtoList.length
        ? product.skuForInvoiceDtoList
        : [product];
      return variants.map((sku: any) => ({
        skuId: String(sku?.id ?? product?.id ?? ''),
        productId: String(product?.id ?? ''),
        skuTitle: String(sku?.skuTitle ?? product?.skuTitle ?? ''),
        title: String(product?.productTitle ?? product?.skuTitle ?? sku?.skuTitle ?? 'Nomsiz mahsulot'),
        amount: Number(sku?.quantityToStock ?? product?.quantityToStock ?? 0),
        quantityAccepted: sku?.quantityAccepted == null || String(sku.quantityAccepted).trim() === ''
          ? NaN : Number(sku.quantityAccepted),
        purchasePrice: Number(sku?.purchasePrice ?? product?.purchasePrice ?? 0),
      }));
    });
  }

  // ─── FBS Invoices (Ta'minlashlar) ────────────────────────────────────

  async getInvoices(
    userId: string,
    storeId: string,
    statuses?: string[],
    page: number = 0,
    size: number = 20,
    smartupFilter: string = 'ALL',
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const safePage = Math.max(0, Math.floor(Number(page) || 0));
    const safeSize = Math.min(Math.max(Math.floor(Number(size) || 20), 1), 20);
    if (['IMPORTED', 'NOT_IMPORTED', 'MISSING'].includes(smartupFilter)) {
      const catalog = await this.getInvoiceCatalog(storeId, apiKey, statuses);
      const enriched = await this.enrichInvoicesWithSmartupStatus(storeId, catalog.invoices);
      const filtered = enriched.filter((invoice) => {
        const state = invoice.smartupImport?.status;
        const imported = state === 'SUCCESS' && !!invoice.smartupImport?.smartupDealId;
        return smartupFilter === 'IMPORTED' ? imported
          : smartupFilter === 'MISSING' ? state === 'NOT_FOUND'
            : !imported && state !== 'NOT_FOUND';
      });
      return {
        invoices: filtered.slice(safePage * safeSize, (safePage + 1) * safeSize),
        page: safePage, size: safeSize, total: filtered.length,
        hasNext: (safePage + 1) * safeSize < filtered.length,
      };
    }
    const key = `${storeId}:invoices:${userId}:${safePage}:${safeSize}:${(statuses || []).join(',')}`;
    const pageResult = await this.reads.get(key, 5_000, async () => {
      const { invoices } = await this.uzumClient.getFbsInvoices(storeId, apiKey, statuses, safePage, safeSize);
      // Uzum does not return an exact total here. Preserve its page ordering
      // and expose hasNext instead of crawling up to 100 pages for a count.
      return { invoices, page: safePage, size: safeSize, hasNext: invoices.length === safeSize };
    });
    return {
      ...pageResult,
      invoices: await this.enrichInvoicesWithSmartupStatus(storeId, pageResult.invoices),
    };
  }

  private async getInvoiceCatalog(storeId: string, apiKey: string, statuses?: string[]) {
    const normalizedStatuses = statuses?.length
      ? statuses
      : ['CREATED', 'ACCEPTANCE_IN_PROGRESS', 'ACCEPTED', 'CANCELLED'];
    return this.reads.get(`${storeId}:invoices:catalog:${normalizedStatuses.join(',')}`, 60_000, async () => {
      const invoiceIds = new Set<string>();
      const allInvoices: any[] = [];
      const pageSize = 20;
      let complete = false;
      let scannedPages = 0;

      for (let page = 0; page < 500; page += 1) {
        const { invoices } = await this.uzumClient.getFbsInvoices(
          storeId,
          apiKey,
          normalizedStatuses,
          page,
          pageSize,
        );
        scannedPages += 1;
        let added = 0;
        for (const invoice of invoices || []) {
          const id = String(invoice?.id ?? '').trim();
          if (id && !invoiceIds.has(id)) {
            invoiceIds.add(id);
            allInvoices.push(invoice);
            added += 1;
          }
        }
        if ((invoices || []).length < pageSize) {
          complete = true;
          break;
        }
        if (added === 0) {
          throw new ServiceUnavailableException('Uzum ta’minlashlar sahifasini takrorladi. Umumiy Smartup hisobini aniqlab bo‘lmadi.');
        }
      }
      if (!complete) {
        throw new ServiceUnavailableException('Ta’minlashlar soni xavfsiz sahifa chegarasidan oshdi. Umumiy Smartup hisobini aniqlab bo‘lmadi.');
      }
      return { invoices: allInvoices, scannedPages };
    });
  }

  async getInvoiceSmartupCounts(userId: string, storeId: string, statuses?: string[]) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const catalog = await this.getInvoiceCatalog(storeId, apiKey, statuses);
    const invoiceIds = new Set(catalog.invoices.map((invoice) => String(invoice.id)));
    const acceptedCounts = new Map(catalog.invoices.map((invoice) => [String(invoice.id), Number(invoice.numberAcceptedOrders)]));
    const { scannedPages } = catalog;

      const smartupRows = this.prisma?.smartupOrderImport
        ? await this.prisma.smartupOrderImport.findMany({
          where: {
            storeId,
            uzumInvoiceId: { not: null },
          },
          select: { uzumInvoiceId: true, status: true, smartupDealId: true },
        })
        : [];
      const statesByInvoice = new Map<string, Set<string>>();
      const successfulCounts = new Map<string, number>();
      for (const row of smartupRows) {
        const id = String(row.uzumInvoiceId ?? '').trim();
        if (!id || !invoiceIds.has(id)) continue;
        const states = statesByInvoice.get(id) || new Set<string>();
        const state = row.status === 'SUCCESS' && !row.smartupDealId ? 'REVIEW_REQUIRED' : String(row.status ?? '');
        states.add(state);
        if (state === 'SUCCESS') successfulCounts.set(id, (successfulCounts.get(id) || 0) + 1);
        statesByInvoice.set(id, states);
      }
      const missingIds = new Set([...statesByInvoice.entries()]
        .filter(([, states]) => states.has('NOT_FOUND'))
        .map(([id]) => id));
      const importedIds = new Set([...statesByInvoice.entries()]
        .filter(([id, states]) => states.size === 1 && states.has('SUCCESS')
          && this.hasAllAcceptedImports(Number(acceptedCounts.get(id)), successfulCounts.get(id) || 0))
        .map(([id]) => id));
      const all = invoiceIds.size;
      const imported = importedIds.size;
      const missing = missingIds.size;
      return {
        all,
        imported,
        missing,
        notImported: Math.max(0, all - imported - missing),
        scannedPages,
        checkedAt: new Date().toISOString(),
      };
  }

  private hasAllAcceptedImports(expected: number, successful: number): boolean {
    return !Number.isFinite(expected) || expected <= 0 || successful >= expected;
  }

  private async enrichInvoicesWithSmartupStatus(storeId: string, invoices: any[]) {
    const invoiceIds = [...new Set((invoices || []).map((invoice) => String(invoice?.id ?? '')).filter(Boolean))];
    if (!invoiceIds.length || !this.prisma?.smartupOrderImport) return invoices || [];

    let imports: any[];
    try {
      imports = await this.prisma.smartupOrderImport.findMany({
        where: { storeId, uzumInvoiceId: { in: invoiceIds } },
        select: {
          uzumInvoiceId: true,
          smartupExternalId: true,
          smartupDealId: true,
          status: true,
          errorMessage: true,
          importedAt: true,
        },
        orderBy: { importedAt: 'desc' },
      });
    } catch (err: any) {
      this.logger.warn(`Smartup invoice status enrichment failed: ${err?.message}`);
      throw new ServiceUnavailableException('Smartup holatlarini bazadan olib bo‘lmadi. Qayta urinib ko‘ring.');
    }
    const byInvoice = new Map<string, typeof imports>();
    for (const row of imports) {
      if (!row.uzumInvoiceId) continue;
      const rows = byInvoice.get(row.uzumInvoiceId) || [];
      rows.push(row);
      byInvoice.set(row.uzumInvoiceId, rows);
    }
    const priority: Record<string, number> = { NOT_FOUND: 5, REVIEW_REQUIRED: 4, PROCESSING: 3, ERROR: 2, SUCCESS: 1 };

    return (invoices || []).map((invoice) => {
      const rows = byInvoice.get(String(invoice?.id ?? '')) || [];
      let primary = [...rows].sort((a, b) => (priority[b.status] || 0) - (priority[a.status] || 0))[0];
      const successful = rows.filter((row) => row.status === 'SUCCESS' && row.smartupDealId).length;
      if (primary?.status === 'SUCCESS' && rows.some((row) => !row.smartupDealId)) {
        primary = { ...primary, status: 'REVIEW_REQUIRED', errorMessage: 'Smartup Deal ID saqlanmagan. Hujjat holatini tekshiring.' };
      } else if (primary?.status === 'SUCCESS'
        && !this.hasAllAcceptedImports(Number(invoice?.numberAcceptedOrders), successful)) {
        primary = { ...primary, status: 'ERROR', errorMessage: `Ta’minlash qisman ko‘chirilgan: ${successful}/${invoice.numberAcceptedOrders}. Qolgan buyurtmalarni ko‘chiring.` };
      }
      const dealIds = [...new Set(rows.filter((row) => row.status === 'SUCCESS' && row.smartupDealId)
        .map((row) => row.smartupDealId!))];
      return {
        ...invoice,
        smartupImport: primary ? {
          status: primary.status,
          smartupExternalId: primary.smartupExternalId,
          smartupDealId: dealIds[0] || primary.smartupDealId,
          smartupDealIds: dealIds,
          errorMessage: primary.errorMessage,
          importedAt: primary.importedAt,
          importedOrders: successful,
        } : null,
      };
    });
  }

  private fbsInvoiceDateMs(invoice: any): number {
    const candidates = [
      invoice?.createdAt,
      invoice?.createdDate,
      invoice?.dateCreated,
      invoice?.creationDate,
      invoice?.date,
      invoice?.timeSlot?.timeFrom,
      invoice?.timeSlot?.from,
      invoice?.timeSlot?.dateFrom,
      invoice?.updatedAt,
    ];

    for (const value of candidates) {
      if (value == null) continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
      }
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return 0;
  }

  async getInvoice(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId);
  }

  async getInvoiceOrders(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const [invoice, orders] = await Promise.all([
      this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId),
      this.uzumClient.getFbsInvoiceOrders(storeId, apiKey, invoiceId),
    ]);
    const acceptedOrders = await this.getAcceptedInvoiceOrders(
      storeId,
      apiKey,
      invoice,
      orders,
      false,
    );
    const acceptedIds = new Set(acceptedOrders
      .map((order: any) => String(order?.orderId ?? order?.id ?? ''))
      .filter(Boolean));
    for (const order of orders || []) {
      const orderId = String(order?.orderId ?? order?.id ?? '');
      order.acceptedInThisInvoice = acceptedIds.has(orderId);
      order.supplyAcceptanceStatus = acceptedIds.has(orderId) ? 'ACCEPTED' : 'NOT_ACCEPTED';
    }

    // Har bir mahsulot qatorini tan narx (USD) bilan boyitamiz — dashboard bilan
    // bir xil manba (skuTitle/productId → costUsd, SWR keshlangan). Frontend
    // shu asosda tan narxlar yig'indisini ko'rsatadi.
    try {
      const cost = await this.financeSync.resolveCosts(userId, storeId);
      const byTitle: Record<string, number> = cost?.costByFullTitle || {};
      const byPid: Record<string, number> = cost?.costByProductId || {};
      for (const o of orders || []) {
        const items = o?.items || o?.orderItems || [];
        for (const it of items) {
          let cp = it?.skuTitle != null ? byTitle[String(it.skuTitle)] : undefined;
          if (cp == null && it?.productId != null) cp = byPid[String(it.productId)];
          it.costUsd = cp != null ? cp : null;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Invoice cost enrichment failed: ${err?.message}`);
    }

    try {
      const statusMap = await this.smartup.getImportStatus(
        storeId,
        (orders || []).map((order: any) => order?.orderId ?? order?.id),
      );
      for (const order of orders || []) {
        const orderId = String(order?.orderId ?? order?.id ?? '');
        order.smartupImport = statusMap[orderId] || null;
      }
    } catch (err: any) {
      this.logger.warn(`Smartup status enrichment failed: ${err?.message}`);
    }

    return {
      orders,
      acceptanceSummary: {
        total: orders.length,
        accepted: acceptedOrders.length,
        notAccepted: Math.max(0, orders.length - acceptedOrders.length),
      },
    };
  }

  async importOrderToSmartup(userId: string, storeId: string, orderId: string, invoiceId: string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    if (!invoiceId?.trim()) throw new BadRequestException('Ta’minlash ID talab qilinadi');
    const [invoice, orders] = await Promise.all([
      this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId),
      this.uzumClient.getFbsInvoiceOrders(storeId, apiKey, invoiceId),
    ]);
    const invoiceOrder = orders.find((item: any) => String(item?.orderId ?? item?.id) === orderId);
    if (!invoiceOrder) throw new BadRequestException('Buyurtma ushbu ta’minlashda topilmadi');
    const acceptedOrders = await this.getAcceptedInvoiceOrders(
      storeId,
      apiKey,
      invoice,
      orders,
    );
    const order = acceptedOrders.find((item: any) => String(item?.orderId ?? item?.id) === orderId);
    if (!order) {
      throw new BadRequestException(
        'Bu buyurtma hali Uzumga topshirilmagan. Smartupga faqat topshirilgan buyurtmalar yuboriladi.',
      );
    }
    try {
      return await this.smartup.importOrder(userId, storeId, order, invoiceId);
    } finally {
      this.reads.invalidate(`${storeId}:invoices:`);
    }
  }

  async checkOrderInSmartup(userId: string, storeId: string, orderId: string) {
    await this.storesService.getStoreCredentials(userId, storeId);
    try {
      return await this.smartup.checkOrder(storeId, orderId);
    } finally {
      this.reads.invalidate(`${storeId}:invoices:`);
    }
  }

  async checkInvoiceImportsInSmartup(userId: string, storeId: string) {
    await this.storesService.getStoreCredentials(userId, storeId);
    try {
      return await this.smartup.checkInvoiceImports(storeId);
    } finally {
      this.reads.invalidate(`${storeId}:invoices:`);
    }
  }

  async checkSmartupProducts(userId: string, storeId: string) {
    await this.storesService.getStoreCredentials(userId, storeId);
    return this.smartup.checkProducts(userId, storeId);
  }

  // ─── FBS qoldiqlari (Inventar) ───────────────────────────────────────
  // Mahsulot katalogi (skuId → rasm/narx/tan narx/sotuv) keshi. Qoldiqlar
  // ro'yxatini boyitishda ishlatiladi; har safar qayta tortmaslik uchun 5 daqiqa.
  async importInvoiceOrdersToSmartup(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const [invoice, orders] = await Promise.all([
      this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId),
      this.uzumClient.getFbsInvoiceOrders(storeId, apiKey, invoiceId),
    ]);
    try {
      const acceptedOrders = await this.getAcceptedInvoiceOrders(
        storeId,
        apiKey,
        invoice,
        orders,
      );
      const result = await this.smartup.importInvoiceOrders(
        userId,
        storeId,
        invoiceId,
        acceptedOrders,
        invoice,
      );
      if (result.ok && result.failed === 0 && this.prisma?.smartupOrderImport) {
        const invoiceKey = String(invoiceId);
        const acceptedIds = acceptedOrders.map((order: any) => String(order?.orderId ?? order?.id));
        // Old imports may still point to the originally planned invoice even
        // after Uzum handed those orders over under another invoice. Reconcile
        // links only after all accepted orders have a successful Smartup import.
        // Keep document IDs, payloads and statuses intact for future checks.
        await this.prisma.$transaction([
          this.prisma.smartupOrderImport.updateMany({
            where: { storeId, uzumInvoiceId: invoiceKey, uzumOrderId: { notIn: acceptedIds } },
            data: { uzumInvoiceId: null },
          }),
          this.prisma.smartupOrderImport.updateMany({
            where: { storeId, uzumOrderId: { in: acceptedIds }, status: 'SUCCESS' },
            data: { uzumInvoiceId: invoiceKey },
          }),
        ]);
      }
      return {
        ...result,
        invoiceOrders: orders.length,
        acceptedOrders: acceptedOrders.length,
        skippedOrders: Math.max(0, orders.length - acceptedOrders.length),
      };
    } finally {
      this.reads.invalidate(`${storeId}:invoices:`);
    }
  }

  private async getAcceptedInvoiceOrders(
    storeId: string,
    apiKey: string,
    invoice: any,
    invoiceOrders: any[],
    requireAtLeastOne = true,
  ): Promise<any[]> {
    const expectedAccepted = Number(invoice?.numberAcceptedOrders ?? 0);
    if (!Number.isInteger(expectedAccepted) || expectedAccepted < 0) {
      throw new BadRequestException('Ta’minlashdagi topshirilgan buyurtmalar soni noto‘g‘ri');
    }
    if (expectedAccepted === 0) {
      if (!requireAtLeastOne) return [];
      throw new BadRequestException(
        'Bu ta’minlashda topshirilgan buyurtma yo‘q. Smartupga hech narsa yuborilmadi.',
      );
    }
    if (!Array.isArray(invoiceOrders) || invoiceOrders.length === 0) {
      throw new BadRequestException(
        'Ta’minlashda buyurtmalar topilmadi. Smartupga hech narsa yuborilmadi.',
      );
    }
    if (expectedAccepted > invoiceOrders.length) {
      throw new BadRequestException(
        'Topshirilgan buyurtmalar soni ta’minlash tarkibidan ko‘p. Uzum ma’lumotlarini yangilang.',
      );
    }

    const invoiceNumber = String(invoice?.number ?? '').trim();
    if (!invoiceNumber) {
      throw new BadRequestException('Ta’minlash raqami topilmadi. Smartupga hech narsa yuborilmadi.');
    }

    const cacheKey = `${storeId}:invoice-accepted:${invoice?.id ?? invoiceNumber}:${invoiceNumber}:${expectedAccepted}`;
    const acceptedIdList = await this.reads.get(cacheKey, 60_000, async () => {
      const acceptedIds = new Set<string>();
      let requestCount = 0;

      // Query each order directly. The single-order endpoint returns the
      // authoritative current status and invoiceNumber, while scanning every
      // status page both exhausted Uzum's rate limit and could mix orders moved
      // to a later supply. A supply normally has only a few dozen orders; the
      // paced exact lookups are bounded and stop as soon as Uzum's accepted
      // count is satisfied.
      for (const invoiceOrder of invoiceOrders) {
        if (acceptedIds.size >= expectedAccepted) break;
        const id = String(invoiceOrder?.orderId ?? invoiceOrder?.id ?? '').trim();
        if (!id) continue;
        if (requestCount > 0) await this.waitForAcceptedOrderLookup();
        requestCount += 1;
        const liveOrder = await this.uzumClient.getOrderById(storeId, apiKey, id);
        const liveStatus = String(liveOrder?.status ?? '').trim();
        const liveInvoiceNumber = String((liveOrder as any)?.invoiceNumber ?? '').trim();
        // Current status alone is insufficient: an order may be accepted into
        // this supply and cancelled several days later. `acceptedDate` is the
        // durable evidence that Uzum physically accepted it. Keep the exact
        // invoice-number match so an order moved to another supply is never
        // counted here.
        const acceptedByStatus = this.acceptedInvoiceOrderStatuses.includes(liveStatus);
        const acceptedByTimestamp = this.hasAcceptedDate((liveOrder as any)?.acceptedDate);
        if ((acceptedByStatus || acceptedByTimestamp) && liveInvoiceNumber === invoiceNumber) {
          acceptedIds.add(id);
        }
      }
      return [...acceptedIds];
    });
    const acceptedIds = new Set<string>(acceptedIdList);

    if (acceptedIds.size !== expectedAccepted) {
      this.logger.warn(
        `Invoice ${invoice?.id ?? ''}: accepted count mismatch, Uzum=${expectedAccepted}, resolved=${acceptedIds.size}`,
      );
      throw new ServiceUnavailableException(
        `Uzumdagi topshirilgan buyurtmalar ro‘yxati aniqlanmadi (${acceptedIds.size}/${expectedAccepted}). Smartupga hech narsa yuborilmadi. Sahifani yangilab qayta urinib ko‘ring.`,
      );
    }

    return invoiceOrders.filter((order: any) => acceptedIds.has(String(order?.orderId ?? order?.id ?? '')));
  }

  private waitForAcceptedOrderLookup(): Promise<void> {
    // Uzum's order-list endpoint replenishes roughly two tokens per second.
    return new Promise((resolve) => setTimeout(resolve, 550));
  }

  private hasAcceptedDate(value: unknown): boolean {
    if (value == null || value === '') return false;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    if (value instanceof Date) return Number.isFinite(value.getTime());
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return true;
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  private stockMetaCache = new Map<string, { fetchedAt: number; map: Map<number, any> }>();
  private readonly STOCK_META_TTL_MS = 5 * 60 * 1000;
  private liveStocksCache = new Map<string, { fetchedAt: number; payload: any }>();
  private liveStocksInflight = new Map<string, Promise<any>>();
  private readonly LIVE_STOCKS_TTL_MS = 2 * 60 * 1000;

  private liveStocksDiskPath(storeId: string): string {
    return path.join(this.fbsCacheDir, `live-stocks-${storeId}.json`);
  }

  private async readLiveStocksDiskCache(storeId: string): Promise<{ fetchedAt: number; payload: any } | null> {
    try {
      return JSON.parse(await fs.readFile(this.liveStocksDiskPath(storeId), 'utf-8'));
    } catch {
      return null;
    }
  }

  private async writeLiveStocksDiskCache(storeId: string, payload: any): Promise<void> {
    try {
      await fs.mkdir(this.fbsCacheDir, { recursive: true });
      await fs.writeFile(
        this.liveStocksDiskPath(storeId),
        JSON.stringify({ fetchedAt: Date.now(), payload }),
        'utf-8',
      );
    } catch (err: any) {
      this.logger.warn(`Live stocks disk cache write failed: ${err?.message}`);
    }
  }

  private async getStockMetaFast(userId: string, storeId: string, force: boolean): Promise<Map<number, any>> {
    const cached = this.stockMetaCache.get(storeId);
    if (!force && cached) return cached.map;
    try {
      return await Promise.race([
        this.getStockMeta(userId, storeId, force),
        new Promise<Map<number, any>>((_, reject) => setTimeout(() => reject(new Error('stock meta timeout')), 12_000)),
      ]);
    } catch (err: any) {
      if (cached) {
        this.logger.warn(`Stock meta slow/failed, serving cached meta: ${err?.message}`);
        return cached.map;
      }
      this.logger.warn(`Stock meta slow/failed, serving stocks without enrichment: ${err?.message}`);
      return new Map<number, any>();
    }
  }

  private pickStockImage(sku: any, product: any): string | undefined {
    // Uzum ba'zan "bare" rasm URL beradi: https://images.uzum.uz/{id} — bunda
    // transform yo'qligi sababli rasm ochilmaydi. Bunday holatda standart
    // transform qo'shamiz. To'liq URL (.../t_product_*.jpg) bo'lsa, o'zini qaytaramiz.
    const normalize = (url?: string): string | undefined => {
      if (!url || typeof url !== 'string') return undefined;
      if (/^https?:\/\/images\.uzum\.uz\/[^/]+$/.test(url)) {
        return `${url}/t_product_540_high.jpg`;
      }
      return url;
    };
    const fromPhoto = (ph: any): string | undefined => {
      if (!ph) return undefined;
      if (typeof ph === 'string') return normalize(ph);
      const obj = ph.photo || ph;
      if (typeof obj === 'string') return normalize(obj);
      for (const size of ['480', '540', '240', '800', '160']) {
        if (obj?.[size]?.high) return normalize(obj[size].high);
        if (obj?.[size]?.low) return normalize(obj[size].low);
      }
      return undefined;
    };
    // Variant (sku) rasmini afzal ko'ramiz, keyin mahsulot rasmiga qaytamiz.
    return (
      fromPhoto(sku?.previewImage) ||
      fromPhoto(sku?.photo) ||
      fromPhoto(product?.image) ||
      fromPhoto(product?.previewImg)
    );
  }

  /** skuId → {image, productId, price, purchasePrice, sold, category, productTitle, article}. Cached 5 min. */
  private async getStockMeta(userId: string, storeId: string, force = false): Promise<Map<number, any>> {
    const cached = this.stockMetaCache.get(storeId);
    if (!force && cached && Date.now() - cached.fetchedAt < this.STOCK_META_TTL_MS) {
      return cached.map;
    }
    const map = new Map<number, any>();
    try {
      const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
      const client = (this.uzumClient as any).buildClient(apiKey);
      const size = 50;
      let page = 0;
      let total = Infinity;
      while (page * size < total && page < 40) {
        const res = await client.get(`/v1/product/shop/${uzumShopId}`, {
          params: { page, size, filter: 'ALL', sortBy: 'DEFAULT', order: 'DESC' },
        });
        const payload = res.data?.payload || res.data || {};
        const products = payload.productList || [];
        total = payload.totalProductsAmount ?? products.length;
        if (!products.length) break;
        for (const p of products) {
          const category = typeof p?.category === 'string' ? p.category : p?.category?.title || p?.category?.name || '';
          for (const sku of p?.skuList || []) {
            map.set(sku.skuId, {
              image: this.pickStockImage(sku, p),
              productId: p.productId,
              price: Number(sku.price) || 0,
              purchasePrice: Number(sku.purchasePrice) || 0,
              sold: Number(sku.quantitySold) || 0,
              category,
              productTitle: sku.productTitle || p.title || '',
              article: sku.article || '',
              skuFullTitle: sku.skuFullTitle || sku.skuTitle || '',
            });
          }
        }
        page++;
        await new Promise((r) => setTimeout(r, 150));
      }
      this.stockMetaCache.set(storeId, { fetchedAt: Date.now(), map });
    } catch (err: any) {
      this.logger.warn(`Stock meta enrichment failed: ${err?.message}`);
      if (cached) return cached.map; // stale ma'lumot bo'lsa, undan foydalanamiz
    }
    return map;
  }

  async getLiveStocks(userId: string, storeId: string, force = false) {
    await this.storesService.getStoreCredentials(userId, storeId);
    const cached = this.liveStocksCache.get(storeId);
    if (!force && cached && Date.now() - cached.fetchedAt < this.LIVE_STOCKS_TTL_MS) {
      return cached.payload;
    }
    const disk = await this.readLiveStocksDiskCache(storeId);
    if (!force && disk) {
      this.liveStocksCache.set(storeId, disk);
      if (!this.liveStocksInflight.has(storeId)) {
        void this.refreshLiveStocks(userId, storeId, false).catch((err: any) => {
          this.logger.warn(`Live stocks background refresh failed: ${err?.message}`);
        });
      }
      return { ...disk.payload, stale: true };
    }

    try {
      return await this.refreshLiveStocks(userId, storeId, force);
    } catch (err: any) {
      if (cached) {
        this.logger.warn(`Live stocks failed, returning stale memory cache: ${err?.message}`);
        return { ...cached.payload, stale: true };
      }
      if (disk) {
        this.logger.warn(`Live stocks failed, returning stale disk cache: ${err?.message}`);
        this.liveStocksCache.set(storeId, disk);
        return { ...disk.payload, stale: true };
      }
      throw err;
    }
  }

  private refreshLiveStocks(userId: string, storeId: string, force = false) {
    const existing = this.liveStocksInflight.get(storeId);
    if (existing) return existing;
    const work = (async () => {
      const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
      const skuAmountList = await this.getLiveStockRows(storeId, apiKey);
      const meta = await this.getStockMetaFast(userId, storeId, force);

      const stocks = (skuAmountList || []).map((s: any) => {
        const m = meta.get(s.skuId) || {};
        return {
          skuId: s.skuId,
          skuTitle: s.skuTitle,
          productTitle: s.productTitle || m.productTitle || '',
          barcode: s.barcode,
          amount: s.amount ?? 0,
          fbsLinked: s.fbsLinked ?? false,
          fbsAllowed: s.fbsAllowed ?? false,
          dbsLinked: s.dbsLinked ?? false,
          dbsAllowed: s.dbsAllowed ?? false,
          sellerSkuCode: s.sellerSkuCode ?? null,
          image: m.image || null,
          productId: m.productId ?? null,
          price: m.price ?? 0,
          purchasePrice: m.purchasePrice ?? 0,
          sold: m.sold ?? 0,
          category: m.category || '',
          article: m.article || '',
        };
      });

      const totalUnits = stocks.reduce((sum: number, x: any) => sum + (x.amount || 0), 0);
      const totalValue = stocks.reduce((sum: number, x: any) => sum + (x.amount || 0) * (x.price || 0), 0);
      const payload = {
        stocks,
        total: stocks.length,
        totalUnits,
        totalValue,
        inStock: stocks.filter((x: any) => x.amount > 0).length,
        outOfStock: stocks.filter((x: any) => x.amount === 0).length,
      };
      this.liveStocksCache.set(storeId, { fetchedAt: Date.now(), payload });
      void this.writeLiveStocksDiskCache(storeId, payload);
      return payload;
    })().finally(() => this.liveStocksInflight.delete(storeId));
    this.liveStocksInflight.set(storeId, work);
    return work;
  }

  private async getLiveStockRows(storeId: string, apiKey: string): Promise<any[]> {
    try {
      const all: any[] = [];
      const seen = new Set<string>();
      const size = 100;
      for (let page = 0; page < 100; page += 1) {
        const { skuAmountList } = await this.uzumClient.getStocksV3(storeId, apiKey, page, size);
        const rows = skuAmountList || [];
        for (const row of rows) {
          const key = String(row?.skuId ?? `${page}:${all.length}`);
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(row);
        }
        if (rows.length < size) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (all.length) return all;
    } catch (err: any) {
      this.logger.warn(`getStocksV3 failed, falling back to v2: ${err?.message}`);
    }
    const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
    return skuAmountList || [];
  }

  private async patchLiveStocksCache(
    storeId: string,
    updates: Array<{
      skuId: number;
      amount: number;
      fbsLinked?: boolean;
      fbsAllowed?: boolean;
      dbsLinked?: boolean;
      dbsAllowed?: boolean;
    }>,
  ): Promise<void> {
    const bySkuId = new Map(updates.map((u) => [Number(u.skuId), u]));
    const patchPayload = (payload: any) => {
      const stocks = Array.isArray(payload?.stocks) ? payload.stocks : null;
      if (!stocks) return null;

      let changed = false;
      const nextStocks = stocks.map((stock: any) => {
        const update = bySkuId.get(Number(stock?.skuId));
        if (!update) return stock;
        changed = true;
        return {
          ...stock,
          amount: update.amount,
          fbsLinked: update.fbsLinked ?? stock.fbsLinked,
          fbsAllowed: update.fbsAllowed ?? stock.fbsAllowed,
          dbsLinked: update.dbsLinked ?? stock.dbsLinked,
          dbsAllowed: update.dbsAllowed ?? stock.dbsAllowed,
        };
      });
      if (!changed) return null;

      const totalUnits = nextStocks.reduce((sum: number, x: any) => sum + (x.amount || 0), 0);
      const totalValue = nextStocks.reduce((sum: number, x: any) => sum + (x.amount || 0) * (x.price || 0), 0);
      return {
        ...payload,
        stocks: nextStocks,
        total: nextStocks.length,
        totalUnits,
        totalValue,
        inStock: nextStocks.filter((x: any) => x.amount > 0).length,
        outOfStock: nextStocks.filter((x: any) => x.amount === 0).length,
        stale: false,
      };
    };

    const cached = this.liveStocksCache.get(storeId);
    const patchedMemory = cached ? patchPayload(cached.payload) : null;
    if (patchedMemory) {
      this.liveStocksCache.set(storeId, { fetchedAt: Date.now(), payload: patchedMemory });
      void this.writeLiveStocksDiskCache(storeId, patchedMemory);
      return;
    }

    const disk = await this.readLiveStocksDiskCache(storeId);
    const patchedDisk = disk ? patchPayload(disk.payload) : null;
    if (patchedDisk) {
      this.liveStocksCache.set(storeId, { fetchedAt: Date.now(), payload: patchedDisk });
      void this.writeLiveStocksDiskCache(storeId, patchedDisk);
    }
  }

  /**
   * Qoldiqlarni yangilaydi. Faqat berilgan SKUlar o'zgaradi (partial update).
   * Har bir SKU uchun joriy barcode + flaglar live/v3 ro'yxatdan olinadi va
   * fbsLinked=true o'rnatiladi (aks holda Uzum SKU'ni FBS'dan uzib, qoldiqni 0 qiladi).
   */
  async setStocks(
    userId: string,
    storeId: string,
    updates: Array<{
      skuId: number;
      amount: number;
      barcode?: string;
      fbsLinked?: boolean;
      fbsAllowed?: boolean;
      dbsLinked?: boolean;
      dbsAllowed?: boolean;
    }>,
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const hasAllContext = updates.every((u) => String(u.barcode ?? '').trim().length > 0);
    const skuAmountList = hasAllContext ? [] : await this.getLiveStockRows(storeId, apiKey);
    const current = new Map<number, any>((skuAmountList || []).map((s: any) => [Number(s.skuId), s]));

    const items = [];
    const skipped: number[] = [];
    for (const u of updates) {
      const cur = current.get(Number(u.skuId)) || u;
      const barcode = String(cur.barcode ?? '').trim();
      if (!barcode) { skipped.push(u.skuId); continue; }
      const amount = Math.max(0, Math.floor(Number(u.amount) || 0));
      items.push({
        skuId: Number(cur.skuId),
        barcode,
        amount,
        fbsLinked: true,
        fbsAllowed: cur.fbsAllowed ?? true,
        dbsLinked: cur.dbsLinked ?? false,
        dbsAllowed: cur.dbsAllowed ?? false,
      });
    }
    if (items.length === 0) {
      return { totalRecords: 0, updatedRecords: 0, skipped };
    }
    const result = await this.uzumClient.setStocks(storeId, apiKey, items);
    if (result.updatedRecords > 0) {
      await this.patchLiveStocksCache(storeId, items);
    }
    return { ...result, skipped };
  }

  /**
   * Mahsulotlar bo'yicha to'liq analitika — barcha mahsulotlarni Uzum'dan tortib
   * agregatlaydi (umumiy ko'rsatkichlar) va har bir mahsulot uchun qatorlar
   * qaytaradi. Og'ir so'rov (sahifalab tortadi), shuning uchun 5 daqiqa keshlanadi.
   */
  async getProductAnalytics(userId: string, storeId: string, force = false) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const cached = this.productAnalyticsCache.get(storeId);
    if (!force && cached && Date.now() - cached.fetchedAt < this.PRODUCT_ANALYTICS_TTL_MS) {
      return cached.payload;
    }

    const products = await this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId);

    const num = (v: any): number => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const normalizeImage = (url?: string): string | null => {
      if (!url || typeof url !== 'string') return null;
      if (/^https?:\/\/images\.uzum\.uz\/[^/]+$/.test(url)) return `${url}/t_product_540_high.jpg`;
      return url;
    };

    let totalViewers = 0, totalSold = 0, totalReturned = 0, totalFeedback = 0;
    let inventoryUnits = 0, inventoryValue = 0, turnover = 0;
    let ratingSum = 0, ratingCount = 0, activeCount = 0, inStockCount = 0;
    const rankDist: Record<string, number> = {};
    const catMap = new Map<string, { count: number; sold: number; turnover: number }>();

    const rows = products.map((p: any) => {
      const skus = Array.isArray(p.skuList)
        ? p.skuList
            .map((sku: any) => ({
              skuId: sku.skuId,
              title: sku.skuFullTitle || sku.skuTitle || sku.title || '',
              barcode: sku.barcode != null ? String(sku.barcode) : null,
              article: sku.article || null,
              sold: num(sku.quantitySold),
              stock: num(sku.quantityFbs) || num(sku.quantityActive) || num(sku.quantityAvailable),
              price: num(sku.price) || num(sku.sellPrice) || num(sku.fullPrice),
            }))
            .sort((a: any, b: any) => b.sold - a.sold || String(a.title).localeCompare(String(b.title)))
        : [];
      const viewers = num(p.viewers);
      const sold = skus.length > 0 ? skus.reduce((sum: number, sku: any) => sum + sku.sold, 0) : num(p.quantitySold);
      const returned = num(p.quantityReturned);
      // FBS sotuvchida qoldiq quantityFbs da turadi (quantityActive ko'pincha 0).
      const stock = skus.length > 0
        ? skus.reduce((sum: number, sku: any) => sum + sku.stock, 0)
        : num(p.quantityFbs) || num(p.quantityActive) || num(p.quantityAvailable);
      const price = num(p.price);
      const rating = num(p.rating);
      const feedback = num(p.feedbackQuantity);
      const conversion = num(p.conversion);
      const returnedPct = num(p.returnedPercentage);
      const rowTurnover = price * sold;
      const statusValue = p?.status?.value || '';
      const statusTitle = p?.status?.title || '';
      const rank = p?.rankInfo?.rank || 'N';
      const category = (typeof p.category === 'string' && p.category) || p?.category?.title || 'Boshqa';
      const skuCount = Array.isArray(p.skuList) ? p.skuList.length : 0;
      // Sotuvdan sotib olishgacha bo'lgan konversiya (ko'rishlardan sotuvga)
      const viewToSale = viewers > 0 ? (sold / viewers) * 100 : 0;

      totalViewers += viewers;
      totalSold += sold;
      totalReturned += returned;
      totalFeedback += feedback;
      inventoryUnits += stock;
      inventoryValue += price * stock;
      turnover += rowTurnover;
      if (rating > 0) { ratingSum += rating; ratingCount++; }
      if (statusValue !== 'ARCHIVED') activeCount++;
      if (stock > 0) inStockCount++;
      rankDist[rank] = (rankDist[rank] || 0) + 1;
      const cm = catMap.get(category) || { count: 0, sold: 0, turnover: 0 };
      cm.count++; cm.sold += sold; cm.turnover += rowTurnover;
      catMap.set(category, cm);

      return {
        productId: p.productId,
        title: p.title || '',
        image: normalizeImage(p.image) || normalizeImage(p.previewImg),
        category,
        price,
        sold,
        returned,
        returnedPct,
        stock,
        viewers,
        conversion,
        viewToSale,
        rating,
        feedback,
        roi: num(p.roi),
        rank,
        skuCount,
        skus,
        turnover: rowTurnover,
        statusValue,
        statusTitle,
      };
    });

    const categories = [...catMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.turnover - a.turnover);

    const payload = {
      totals: {
        products: products.length,
        active: activeCount,
        inStock: inStockCount,
        totalViewers,
        totalSold,
        totalReturned,
        totalFeedback,
        avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
        avgViewToSale: totalViewers > 0 ? (totalSold / totalViewers) * 100 : 0,
        returnRate: totalSold > 0 ? (totalReturned / totalSold) * 100 : 0,
        inventoryUnits,
        inventoryValue,
        turnover,
      },
      funnel: { viewers: totalViewers, sold: totalSold, returned: totalReturned },
      rankDist,
      categories,
      products: rows,
    };

    this.productAnalyticsCache.set(storeId, { fetchedAt: Date.now(), payload });
    return payload;
  }

  async getBatchLabelsPdf(
    userId: string,
    storeId: string,
    orderIds: (number | string)[],
    size: 'LARGE' | 'SMALL' = 'LARGE',
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    const fetchOne = async (orderId: number | string) => {
      let error = 'Uzum etiketkani qaytarmadi';
      // Label omission is worse than a slightly slower print. Uzum intermittently
      // returns 429/empty documents during a large invoice request, so retry each
      // missing label separately with increasing pauses before declaring failure.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const base64 = await this.cachedLabel(storeId, apiKey, orderId, size);
          if (base64) return { orderId, ok: true, document: base64 };
          error = 'Uzum etiketkani bo‘sh qaytardi';
        } catch (err: any) {
          error = err?.message || error;
        }
        if (attempt < 3) await this.waitForLabelRetry(attempt);
      }
      return { orderId, ok: false, error, document: null as string | null };
    };

    // Two concurrent upstream reads are deliberately conservative. Four was fast,
    // but it can trigger rate limiting and silently leave labels out of a batch.
    const results: Array<{ orderId: any; ok: boolean; document?: string | null; error?: string }> = [];
    const CONCURRENCY = 2;
    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      const batch = orderIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(fetchOne));
      results.push(...batchResults);
      if (i + CONCURRENCY < orderIds.length) await new Promise((r) => setTimeout(r, 250));
    }

    return {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      failedOrderIds: results.filter((r) => !r.ok).map((r) => r.orderId),
      results,
    };
  }

  private waitForLabelRetry(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }

  private cachedLabel(storeId: string, apiKey: string, orderId: number | string, size: 'LARGE' | 'SMALL') {
    return this.labels.get(`${storeId}:${orderId}:${size}`, 120_000,
      () => this.uzumClient.getFbsLabelPdfFast(storeId, apiKey, orderId, size));
  }

  /** Returns barcodes for each order item, flattened by amount.
   * Used by the QR code printing feature on the frontend. */
  async getOrderItemBarcodes(userId: string, storeId: string, orderIds: (number | string)[]) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const client = (this.uzumClient as any).buildClient(apiKey);

    type Item = { orderId: number; itemId: number; barcode: string; skuTitle: string; title: string; amount: number };
    const fetchOne = async (orderId: number | string): Promise<{ ok: boolean; items: Item[] }> => {
      try {
        const res = await client.get(`/v1/fbs/order/${orderId}`, { timeout: 8_000 });
        const order = res.data?.payload;
        const items = (order?.orderItems || []).map((it: any) => ({
          orderId: Number(orderId),
          itemId: it.id,
          barcode: String(it.barcode || ''),
          skuTitle: it.skuTitle || '',
          title: it.title || '',
          amount: it.amount || 1,
        }));
        return { ok: true, items };
      } catch {
        return { ok: false, items: [] };
      }
    };

    // Pass 1: parallel batches of 4 with 100ms gap — sweet spot for Uzum
    const perOrder: Array<{ orderId: number | string; ok: boolean; items: Item[] }> = orderIds.map((id) => ({ orderId: id, ok: false, items: [] }));
    const CONCURRENCY = 4;
    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      const batch = orderIds.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(fetchOne));
      results.forEach((r, k) => { perOrder[i + k] = { orderId: batch[k], ...r }; });
      if (i + CONCURRENCY < orderIds.length) await new Promise((r) => setTimeout(r, 100));
    }

    // Up to 3 retry passes — sequential with growing backoff
    for (let pass = 0; pass < 3; pass++) {
      const failedIdx = perOrder.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
      if (failedIdx.length === 0) break;
      this.logger.log(`Barcode retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
      for (const idx of failedIdx) {
        await new Promise((r) => setTimeout(r, 400 + pass * 400));
        const r = await fetchOne(perOrder[idx].orderId);
        perOrder[idx] = { orderId: perOrder[idx].orderId, ...r };
      }
    }

    const items = perOrder.flatMap((r) => r.items);
    const failed = perOrder.filter((r) => !r.ok).length;
    if (failed > 0) {
      this.logger.warn(`Barcode batch: ${failed}/${orderIds.length} orders failed after retries`);
    }
    return { items, failedOrders: failed };
  }
}
