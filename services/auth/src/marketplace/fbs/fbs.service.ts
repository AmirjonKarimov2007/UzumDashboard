import { Injectable, Logger } from '@nestjs/common';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { FinanceSyncService } from '../finance/finance-sync.service';

@Injectable()
export class FbsService {
  private readonly logger = new Logger(FbsService.name);
  // Per-store in-memory cache for counts (60s TTL)
  private countsCache = new Map<string, { data: Record<string, number>; expiresAt: number }>();
  // Stale-while-revalidate cache for live product lists (avoids blocking on Uzum)
  private productsCache = new Map<string, { fetchedAt: number; payload: any }>();
  private productsInflight = new Map<string, Promise<any>>();
  private readonly PRODUCTS_TTL_MS = 2 * 60 * 1000;
  // Mahsulotlar analitikasi keshi (5 daqiqa) — barcha mahsulotlarni tortib agregatlaydi
  private productAnalyticsCache = new Map<string, { fetchedAt: number; payload: any }>();
  private readonly PRODUCT_ANALYTICS_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
    private readonly financeSync: FinanceSyncService,
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
    return this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size, extra);
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
    const base64 = await this.uzumClient.getFbsLabelPdf(storeId, apiKey, orderId, size);
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
    order?: 'asc' | 'desc',
  ) {
    const key = `${storeId}:${page}:${size}:${filter || ''}:${searchQuery || ''}:${sortBy || ''}:${order || ''}`;
    const produce = async () => {
      const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
      return this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
        page, size, filter, searchQuery, sortBy, order,
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
    const cacheKey = `${storeId}:${dateFrom ?? ''}:${dateTo ?? ''}`;
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
    const cached = this.returnReasonsCache.get(storeId);
    if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.data;
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
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
      this.productsCache.clear();
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
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const invoices = await this.uzumClient.getSellerInvoices(storeId, apiKey, { page, size });
    return { invoices };
  }

  // ─── FBS Invoices (Ta'minlashlar) ────────────────────────────────────

  async getInvoices(
    userId: string,
    storeId: string,
    statuses?: string[],
    page: number = 0,
    size: number = 20,
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsInvoices(storeId, apiKey, statuses, page, size);
  }

  async getInvoice(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId);
  }

  async getInvoiceOrders(userId: string, storeId: string, invoiceId: number | string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const orders = await this.uzumClient.getFbsInvoiceOrders(storeId, apiKey, invoiceId);

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

    return { orders };
  }

  // ─── FBS qoldiqlari (Inventar) ───────────────────────────────────────
  // Mahsulot katalogi (skuId → rasm/narx/tan narx/sotuv) keshi. Qoldiqlar
  // ro'yxatini boyitishda ishlatiladi; har safar qayta tortmaslik uchun 5 daqiqa.
  private stockMetaCache = new Map<string, { fetchedAt: number; map: Map<number, any> }>();
  private readonly STOCK_META_TTL_MS = 5 * 60 * 1000;

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
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
    const meta = await this.getStockMeta(userId, storeId, force);

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
        // boyitilgan ma'lumotlar
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
    return {
      stocks,
      total: stocks.length,
      totalUnits,
      totalValue,
      inStock: stocks.filter((x: any) => x.amount > 0).length,
      outOfStock: stocks.filter((x: any) => x.amount === 0).length,
    };
  }

  /**
   * Qoldiqlarni yangilaydi. Faqat berilgan SKUlar o'zgaradi (partial update).
   * Har bir SKU uchun joriy barcode + flaglar saqlanadi va fbsLinked=true
   * o'rnatiladi (aks holda Uzum SKU'ni FBS'dan uzib, qoldiqni 0 qiladi).
   */
  async setStocks(
    userId: string,
    storeId: string,
    updates: Array<{ skuId: number; amount: number }>,
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
    const current = new Map<number, any>((skuAmountList || []).map((s: any) => [s.skuId, s]));

    const items = [];
    const skipped: number[] = [];
    for (const u of updates) {
      const cur = current.get(Number(u.skuId));
      if (!cur) { skipped.push(u.skuId); continue; }
      const amount = Math.max(0, Math.floor(Number(u.amount) || 0));
      items.push({
        skuId: cur.skuId,
        barcode: String(cur.barcode),
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
    return { ...result, skipped };
  }

  /**
   * Mahsulotlar bo'yicha to'liq analitika — barcha mahsulotlarni Uzum'dan tortib
   * agregatlaydi (umumiy ko'rsatkichlar) va har bir mahsulot uchun qatorlar
   * qaytaradi. Og'ir so'rov (sahifalab tortadi), shuning uchun 5 daqiqa keshlanadi.
   */
  async getProductAnalytics(userId: string, storeId: string, force = false) {
    const cached = this.productAnalyticsCache.get(storeId);
    if (!force && cached && Date.now() - cached.fetchedAt < this.PRODUCT_ANALYTICS_TTL_MS) {
      return cached.payload;
    }

    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
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
      const viewers = num(p.viewers);
      const sold = num(p.quantitySold);
      const returned = num(p.quantityReturned);
      // FBS sotuvchida qoldiq quantityFbs da turadi (quantityActive ko'pincha 0).
      const stock = num(p.quantityFbs) || num(p.quantityActive) || num(p.quantityAvailable);
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
      try {
        const base64 = await this.uzumClient.getFbsLabelPdfFast(storeId, apiKey, orderId, size);
        return { orderId, ok: !!base64, document: base64 };
      } catch (err: any) {
        return { orderId, ok: false, error: err?.message, document: null as string | null };
      }
    };

    // Pass 1: parallel batches of 4 with 100ms gap — sweet spot for Uzum's
    // rate limiter (higher concurrency triggers 429 storms)
    const results: Array<{ orderId: any; ok: boolean; document?: string | null; error?: string }> = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      const batch = orderIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(fetchOne));
      results.push(...batchResults);
      if (i + CONCURRENCY < orderIds.length) await new Promise((r) => setTimeout(r, 100));
    }

    // Up to 3 retry passes — sequential with growing backoff
    for (let pass = 0; pass < 3; pass++) {
      const failedIdx = results.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
      if (failedIdx.length === 0) break;
      this.logger.log(`Label retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
      for (const idx of failedIdx) {
        await new Promise((r) => setTimeout(r, 400 + pass * 400));
        results[idx] = await fetchOne(results[idx].orderId);
      }
    }

    return {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
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
