import { Injectable, Logger } from '@nestjs/common';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class FbsService {
  private readonly logger = new Logger(FbsService.name);
  // Per-store in-memory cache for counts (60s TTL)
  private countsCache = new Map<string, { data: Record<string, number>; expiresAt: number }>();

  constructor(
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
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
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
      page, size, filter, searchQuery, sortBy, order,
    });
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

  /** Sequential counts across all FBS statuses (rate-limit safe) with 60s cache */
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

    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const statuses = [
      'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
      'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
      'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
    ];
    // Sequential with small gaps to respect per-second token bucket
    // ~250ms gap keeps us under the burst window and minimizes 429 retries
    const result: Record<string, number> = {};
    for (const status of statuses) {
      result[status] = await this.uzumClient.getFbsOrderCount(
        storeId, apiKey, uzumShopId, status, dateFrom, dateTo,
      );
      await new Promise((r) => setTimeout(r, 250));
    }
    this.countsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
    return result;
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
    // Invalidate counts cache so the tab badge updates immediately
    this.countsCache.clear();
    return result;
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
    return { orders };
  }

  async getLiveStocks(userId: string, storeId: string) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
    return { stocks: skuAmountList, total: skuAmountList.length };
  }

  async getBatchLabelsPdf(
    userId: string,
    storeId: string,
    orderIds: (number | string)[],
    size: 'LARGE' | 'SMALL' = 'LARGE',
  ) {
    const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    // Parallelize in batches of 4 to stay under Uzum's rate limit while
    // dramatically improving speed vs strict sequential (4 in parallel ≈
    // single request latency for the whole batch)
    const BATCH_SIZE = 4;
    const results: Array<{ orderId: any; ok: boolean; document?: string | null; error?: string }> = [];
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batch = orderIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (orderId) => {
          try {
            const base64 = await this.uzumClient.getFbsLabelPdfFast(storeId, apiKey, orderId, size);
            return { orderId, ok: !!base64, document: base64 };
          } catch (err: any) {
            return { orderId, ok: false, error: err?.message };
          }
        }),
      );
      results.push(...batchResults);
      if (i + BATCH_SIZE < orderIds.length) {
        await new Promise((r) => setTimeout(r, 200));
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
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    // Fetch each order in parallel, batches of 4
    const items: Array<{ orderId: number; itemId: number; barcode: string; skuTitle: string; title: string; amount: number }> = [];
    const BATCH = 4;
    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batch = orderIds.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (orderId) => {
          // Fetch single order via FBS orders endpoint by status — fallback: use cached order data via storesService
          // Simpler: fetch the order via /v1/fbs/order/{orderId} which returns full info
          try {
            const client = (this.uzumClient as any).buildClient(apiKey);
            const res = await client.get(`/v1/fbs/order/${orderId}`, { timeout: 8_000 });
            const order = res.data?.payload;
            return (order?.orderItems || []).map((it: any) => ({
              orderId: Number(orderId),
              itemId: it.id,
              barcode: String(it.barcode || ''),
              skuTitle: it.skuTitle || '',
              title: it.title || '',
              amount: it.amount || 1,
            }));
          } catch {
            return [];
          }
        }),
      );
      batchResults.forEach((arr) => items.push(...arr));
      if (i + BATCH < orderIds.length) await new Promise((r) => setTimeout(r, 200));
    }
    return { items };
  }
}
