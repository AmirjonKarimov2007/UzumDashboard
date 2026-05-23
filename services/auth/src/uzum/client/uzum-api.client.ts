import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { PrismaService } from '../../common/database/prisma.service';

export interface UzumRateLimitInfo {
  remaining: number;
  replenishRate: number;
  burstCapacity: number;
  limitPerDay: number;
  remainingPerDay: number;
  resetAt: Date | null;
}

export interface UzumPaginatedResponse<T> {
  payload: T[];
  pageNumber: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UzumShop {
  id: number;
  name: string;
  status: string;
}

export interface UzumProduct {
  skuId: number;
  productId: number;
  name: string;
  categoryTitle: string;
  fullPrice: number;
  sellPrice: number;
  purchasePrice?: number;
  stocks: number;
  ordersAmount: number;
  revenue: number;
  rating: number;
  reviewsAmount: number;
  viewsAmount: number;
  status: string;
  productRank: string;
  imageUrls: string[];
  characteristics?: Record<string, string>;
}

export interface UzumOrder {
  orderId: number;
  deliverySchema: string;
  status: string;
  orderDate: string;
  orderItems: UzumOrderItem[];
  deliveryInfo?: {
    customerFullName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    city?: string;
  };
  financialInfo?: {
    totalAmount: number;
    commission: number;
    deliveryPrice: number;
    discount: number;
  };
}

export interface UzumOrderItem {
  skuId: number;
  skuTitle: string;
  qty: number;
  price: number;
  totalPrice: number;
}

export interface UzumFinanceOrder {
  orderId: number;
  orderDate: string;
  status: string;
  amount: number;
  commission: number;
  transfer: number;
  shopId: number;
  items: {
    skuId: number;
    skuTitle: string;
    qty: number;
    price: number;
    commission: number;
  }[];
}

export interface UzumExpense {
  id: number;
  type: string;
  description: string;
  amount: number;
  date: string;
  shopId: number;
}

export interface UzumStock {
  skuId: number;
  stocks: number;
  reserved: number;
}

@Injectable()
export class UzumApiClient {
  private readonly logger = new Logger(UzumApiClient.name);
  private readonly baseUrl = 'https://api-seller.uzum.uz/api/seller-openapi';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private buildClient(apiKey: string): AxiosInstance {
    // Uzum Seller API expects raw token WITHOUT "Bearer " prefix
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
      headers: {
        Authorization: apiKey,
        Accept: '*/*',
        'User-Agent': 'Uzum-Dashboard/1.0',
      },
    });
  }

  private extractRateLimitInfo(headers: Record<string, string>): UzumRateLimitInfo {
    return {
      remaining: parseInt(headers['x-ratelimit-remaining'] || '1000', 10),
      replenishRate: parseInt(headers['x-ratelimit-replenish-rate'] || '100', 10),
      burstCapacity: parseInt(headers['x-ratelimit-burst-capacity'] || '1000', 10),
      limitPerDay: parseInt(headers['x-ratelimit-limit-per-day'] || '10000', 10),
      remainingPerDay: parseInt(headers['x-ratelimit-remaining-per-day'] || '10000', 10),
      resetAt: null,
    };
  }

  private async persistRateLimitInfo(storeId: string, info: UzumRateLimitInfo): Promise<void> {
    await this.prisma.storeConnection.updateMany({
      where: { store: { id: storeId } },
      data: {
        rateLimitRemaining: info.remaining,
        rateLimitDayRemaining: info.remainingPerDay,
      },
    });
  }

  private async logApiCall(
    storeId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    rateLimitInfo?: UzumRateLimitInfo,
    error?: string,
  ): Promise<void> {
    await this.prisma.apiLog.create({
      data: {
        storeId,
        endpoint,
        method,
        statusCode,
        responseTimeMs,
        rateLimitRemaining: rateLimitInfo?.remaining,
        rateLimitDayRemaining: rateLimitInfo?.remainingPerDay,
        error,
      },
    });
  }

  private async executeWithRetry<T>(
    storeId: string,
    apiKey: string,
    endpoint: string,
    method: string,
    fn: (client: AxiosInstance) => Promise<AxiosResponse<T>>,
  ): Promise<T> {
    const client = this.buildClient(apiKey);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const start = Date.now();
      try {
        const response = await fn(client);
        const responseTimeMs = Date.now() - start;
        const rateInfo = this.extractRateLimitInfo(response.headers as Record<string, string>);

        await Promise.all([
          this.logApiCall(storeId, endpoint, method, response.status, responseTimeMs, rateInfo),
          this.persistRateLimitInfo(storeId, rateInfo),
        ]);

        // Warn on low rate limit
        if (rateInfo.remainingPerDay < 100) {
          this.logger.warn(
            `Store ${storeId}: Daily rate limit nearly exhausted (${rateInfo.remainingPerDay} remaining)`,
          );
        }

        return response.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        const responseTimeMs = Date.now() - start;
        const statusCode = axiosErr.response?.status || 0;

        await this.logApiCall(
          storeId,
          endpoint,
          method,
          statusCode,
          responseTimeMs,
          undefined,
          axiosErr.message,
        );

        if (statusCode === 401) {
          throw new UnauthorizedException('Uzum API kaliti noto\'g\'ri — Uzum Seller panel → API sozlamalaridan yangi kalit oling');
        }

        if (statusCode === 403) {
          // Parse response body to distinguish different 403 causes
          const responseData = (axiosErr.response?.data as any);
          const errorMsg = responseData?.errors?.[0]?.message || responseData?.error || '';
          const rawBody = typeof responseData === 'string' ? responseData : '';

          if (errorMsg.includes('Token expired')) {
            throw new UnauthorizedException(
              'Uzum API kalitining muddati tugagan. Uzum Seller panelga kirib yangi kalit yarating'
            );
          }
          if (errorMsg.includes('Token not found')) {
            throw new UnauthorizedException(
              'Uzum API kaliti topilmadi. Uzum Seller panelga → Sozlamalar → API integratsiya bo\'limiga kiring va yangi kalit yarating'
            );
          }
          if (rawBody.includes('RBAC') || rawBody.includes('access denied')) {
            throw new UnauthorizedException(
              'Uzum API kalitingiz bu endpoint uchun ruxsatga ega emas. Uzum Seller panelda kalit ruxsatlarini kengaytiring'
            );
          }
          throw new UnauthorizedException('Uzum API ruxsat rad etildi — do\'kon ruxsatlarini tekshiring');
        }

        if (statusCode === 429) {
          const retryAfter = parseInt(axiosErr.response?.headers['retry-after'] || '60', 10);
          this.logger.warn(`Rate limited on attempt ${attempt}. Waiting ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        lastError = axiosErr;

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.warn(`Attempt ${attempt} failed for ${endpoint}. Retrying in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    const errMsg = lastError?.message || `rate-limited or unreachable for ${endpoint}`;
    throw new ServiceUnavailableException(`Uzum API unavailable after ${this.maxRetries} attempts: ${errMsg}`);
  }

  // ─── Shops ────────────────────────────────────────────────────────────────

  async getShops(storeId: string, apiKey: string): Promise<UzumShop[]> {
    // /v1/shops returns a plain array (not wrapped in {payload})
    const data = await this.executeWithRetry<UzumShop[] | { payload: UzumShop[] }>(
      storeId,
      apiKey,
      '/v1/shops',
      'GET',
      (client) => client.get('/v1/shops'),
    );
    if (Array.isArray(data)) return data;
    return (data as any)?.payload || [];
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async getProducts(
    storeId: string,
    apiKey: string,
    shopId: string | number,
    params: {
      page?: number;
      size?: number;
      filter?: string;
      sortBy?: string;
      order?: string;
      searchQuery?: string;
    } = {},
  ): Promise<{ products: any[]; total: number }> {
    const { page = 0, size = 50, filter = 'ALL', sortBy = 'DEFAULT', order = 'DESC', searchQuery } = params;

    const data = await this.executeWithRetry<{ productList: any[]; totalProductsAmount: number }>(
      storeId,
      apiKey,
      `/v1/product/shop/${shopId}`,
      'GET',
      (client) =>
        client.get(`/v1/product/shop/${shopId}`, {
          params: { page, size, filter, sortBy, order, ...(searchQuery ? { searchQuery } : {}) },
        }),
    );
    return {
      products: data?.productList || [],
      total: data?.totalProductsAmount || 0,
    };
  }

  async getAllProducts(
    storeId: string,
    apiKey: string,
    shopId: string | number,
  ): Promise<any[]> {
    const pageSize = 50;
    const firstPage = await this.getProducts(storeId, apiKey, shopId, { page: 0, size: pageSize });
    if (firstPage.products.length === 0) return [];

    const totalPages = Math.ceil(firstPage.total / pageSize);
    const allProducts = [...firstPage.products];

    for (let p = 1; p < totalPages; p++) {
      await this.sleep(200);
      const pageData = await this.getProducts(storeId, apiKey, shopId, { page: p, size: pageSize });
      if (pageData.products.length === 0) break;
      allProducts.push(...pageData.products);
    }

    return allProducts;
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async getOrders(
    storeId: string,
    apiKey: string,
    shopIds: string[],
    params: {
      page?: number;
      size?: number;
      status?: string;
      scheme?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<UzumPaginatedResponse<UzumOrder>> {
    const { page = 0, size = 50, status, scheme, dateFrom, dateTo } = params;

    const queryParams: Record<string, unknown> = {
      shopIds,
      page,
      size,
    };
    if (status) queryParams.status = status;
    if (scheme) queryParams.scheme = scheme;
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;

    const data = await this.executeWithRetry<UzumPaginatedResponse<UzumOrder>>(
      storeId,
      apiKey,
      '/v2/fbs/orders',
      'GET',
      (client) => client.get('/v2/fbs/orders', { params: queryParams }),
    );
    return data;
  }

  async getAllOrders(
    storeId: string,
    apiKey: string,
    shopIds: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<UzumOrder[]> {
    const pageSize = 50;
    const allOrders: UzumOrder[] = [];

    const statuses = [
      'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
      'DELIVERED', 'COMPLETED', 'CANCELED', 'RETURNED',
    ];

    for (const status of statuses) {
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        await this.sleep(150);
        const response = await this.getOrders(storeId, apiKey, shopIds, {
          page,
          size: pageSize,
          status,
          dateFrom,
          dateTo,
        });

        if (!response?.payload?.length) {
          hasMore = false;
          break;
        }

        allOrders.push(...response.payload);
        hasMore = response.payload.length === pageSize;
        page++;
      }
    }

    return allOrders;
  }

  async getOrderById(
    storeId: string,
    apiKey: string,
    orderId: string,
  ): Promise<UzumOrder> {
    return this.executeWithRetry<UzumOrder>(
      storeId,
      apiKey,
      `/v1/fbs/order/${orderId}`,
      'GET',
      (client) => client.get(`/v1/fbs/order/${orderId}`),
    );
  }

  // ─── Finance ──────────────────────────────────────────────────────────────

  async getFinanceOrders(
    storeId: string,
    apiKey: string,
    shopIds: (string | number)[],
    params: {
      page?: number;
      size?: number;
      dateFrom?: number;
      dateTo?: number;
      statuses?: string[];
      group?: boolean;
    } = {},
  ): Promise<{ orderItems: any[]; total: number }> {
    const { page = 0, size = 50, dateFrom, dateTo, statuses, group } = params;

    const queryParams: Record<string, unknown> = { shopIds, page, size };
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;
    if (statuses?.length) queryParams.statuses = statuses;
    if (group !== undefined) queryParams.group = group;

    const data = await this.executeWithRetry<{ orderItems: any[]; totalElements: number }>(
      storeId,
      apiKey,
      '/v1/finance/orders',
      'GET',
      (client) => client.get('/v1/finance/orders', { params: queryParams }),
    );
    return {
      orderItems: data?.orderItems || [],
      total: data?.totalElements || 0,
    };
  }

  async getAllFinanceOrders(
    storeId: string,
    apiKey: string,
    shopIds: (string | number)[],
    dateFrom?: number,
    dateTo?: number,
  ): Promise<any[]> {
    const pageSize = 50;
    const allOrders: any[] = [];
    let page = 0;

    while (true) {
      await this.sleep(150);
      const { orderItems } = await this.getFinanceOrders(storeId, apiKey, shopIds, {
        page, size: pageSize, dateFrom, dateTo,
      });
      if (orderItems.length === 0) break;
      allOrders.push(...orderItems);
      if (orderItems.length < pageSize) break;
      page++;
    }

    return allOrders;
  }

  async getExpenses(
    storeId: string,
    apiKey: string,
    shopIds: (string | number)[],
    params: { page?: number; size?: number; dateFrom?: number; dateTo?: number; sources?: string[] } = {},
  ): Promise<{ payments: any[] }> {
    const { page = 0, size = 50, dateFrom, dateTo, sources } = params;

    const queryParams: Record<string, unknown> = { shopIds, page, size };
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;
    if (sources?.length) queryParams.sources = sources;

    const data = await this.executeWithRetry<{ payload: { payments: any[] } }>(
      storeId,
      apiKey,
      '/v1/finance/expenses',
      'GET',
      (client) => client.get('/v1/finance/expenses', { params: queryParams }),
    );
    return { payments: data?.payload?.payments || [] };
  }

  async getAllExpenses(
    storeId: string,
    apiKey: string,
    shopIds: (string | number)[],
    dateFrom?: number,
    dateTo?: number,
  ): Promise<any[]> {
    const pageSize = 50;
    const all: any[] = [];
    let page = 0;

    while (true) {
      await this.sleep(150);
      const { payments } = await this.getExpenses(storeId, apiKey, shopIds, {
        page, size: pageSize, dateFrom, dateTo,
      });
      if (payments.length === 0) break;
      all.push(...payments);
      if (payments.length < pageSize) break;
      page++;
    }

    return all;
  }

  // ─── Stock (FBS SKU stocks — no pagination, no shopId required) ──────────

  async getStocks(
    storeId: string,
    apiKey: string,
    _shopId?: string,
    _page = 0,
    _size = 50,
  ): Promise<{ skuAmountList: any[] }> {
    const data = await this.executeWithRetry<{ payload: { skuAmountList: any[] } }>(
      storeId,
      apiKey,
      '/v2/fbs/sku/stocks',
      'GET',
      (client) => client.get('/v2/fbs/sku/stocks'),
    );
    return { skuAmountList: data?.payload?.skuAmountList || [] };
  }

  async getAllStocks(
    storeId: string,
    apiKey: string,
    shopId?: string,
  ): Promise<any[]> {
    const { skuAmountList } = await this.getStocks(storeId, apiKey, shopId);
    return skuAmountList;
  }

  // ─── FBS (Fulfillment By Seller) ──────────────────────────────────────────

  async getFbsOrders(
    storeId: string,
    apiKey: string,
    shopId: string | number,
    status: string = 'PACKING',
    page: number = 0,
    size: number = 50,
    extra: { scheme?: 'FBS' | 'DBS'; dateFrom?: number; dateTo?: number } = {},
  ): Promise<{ orders: any[]; totalAmount?: number }> {
    const params: Record<string, unknown> = { shopIds: shopId, status, page, size };
    if (extra.scheme) params.scheme = extra.scheme;
    if (extra.dateFrom) params.dateFrom = extra.dateFrom;
    if (extra.dateTo) params.dateTo = extra.dateTo;

    const data = await this.executeWithRetry<{ payload: { orders: any[]; totalAmount?: number } }>(
      storeId,
      apiKey,
      '/v2/fbs/orders',
      'GET',
      (client) => client.get('/v2/fbs/orders', { params }),
    );
    return {
      orders: data?.payload?.orders || [],
      totalAmount: data?.payload?.totalAmount,
    };
  }

  async getAllFbsOrders(
    storeId: string,
    apiKey: string,
    shopId: string | number,
    statuses: string[] = ['CREATED', 'PACKING', 'RETURNED'],
  ): Promise<any[]> {
    const all: any[] = [];
    for (const status of statuses) {
      let page = 0;
      const pageSize = 50;
      while (true) {
        try {
          await this.sleep(150);
          const { orders } = await this.getFbsOrders(
            storeId,
            apiKey,
            shopId,
            status,
            page,
            pageSize,
          );
          if (orders.length === 0) break;
          all.push(...orders);
          if (orders.length < pageSize) break;
          page++;
        } catch (err) {
          this.logger.warn(`FBS status=${status} page=${page} failed: ${(err as Error).message}`);
          break;
        }
      }
    }
    return all;
  }

  async getFbsOrderCount(
    storeId: string,
    apiKey: string,
    shopId: string | number,
    status: string,
    dateFrom?: number,
    dateTo?: number,
  ): Promise<number> {
    const client = this.buildClient(apiKey);
    const params = {
      shopIds: shopId,
      status,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };

    // Try once; on 429 wait 2s and retry once (not the full retry-after)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await client.get('/v2/fbs/orders/count', { params, timeout: 8_000 });
        return response.data?.payload ?? 0;
      } catch (err: any) {
        const status429 = err?.response?.status === 429;
        if (status429 && attempt === 1) {
          await this.sleep(2000);
          continue;
        }
        this.logger.warn(`count failed for status=${status}: ${err?.message}`);
        return 0;
      }
    }
    return 0;
  }

  /** Confirm a CREATED order — moves it to PACKING status */
  async confirmFbsOrder(
    storeId: string,
    apiKey: string,
    orderId: number | string,
  ): Promise<{ ok: boolean; order?: any; error?: string }> {
    const client = this.buildClient(apiKey);
    try {
      const response = await client.post(`/v1/fbs/order/${orderId}/confirm`, undefined, { timeout: 10_000 });
      return { ok: true, order: response.data?.payload };
    } catch (err: any) {
      const code = err?.response?.data?.errors?.[0]?.code || err?.response?.status;
      const message = err?.response?.data?.errors?.[0]?.message || err?.message;
      this.logger.warn(`confirmFbsOrder ${orderId} failed: ${code} — ${message}`);
      return { ok: false, error: message };
    }
  }

  // ─── FBS Invoices (Ta'minlashlar) ──────────────────────────────────────

  async getFbsInvoices(
    storeId: string,
    apiKey: string,
    statuses: string[] = ['CREATED', 'ACCEPTANCE_IN_PROGRESS', 'ACCEPTED', 'CANCELLED'],
    page: number = 0,
    size: number = 20,
  ): Promise<{ invoices: any[] }> {
    const client = this.buildClient(apiKey);

    // Build URL manually to control exact query string format
    // Uzum's /v1/fbs/invoice enforces max size=20 — clamp on our side
    const safeSize = Math.min(Math.max(size, 1), 20);
    const qs: string[] = [];
    statuses.forEach((s) => qs.push(`statuses=${encodeURIComponent(s)}`));
    qs.push(`page=${page}`);
    qs.push(`size=${safeSize}`);
    const url = `/v1/fbs/invoice?${qs.join('&')}`;

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await client.get(url, { timeout: 12_000 });
        return { invoices: response.data?.payload || [] };
      } catch (err: any) {
        const code = err?.response?.status;
        const body = err?.response?.data;
        // Uzum sporadically returns 400 "Bad request" for valid requests when load is high
        const retryable = code === 429 || code === 503 || code === 400 || code === 502 || code === 504;
        if (retryable && attempt < 4) {
          this.logger.warn(`getFbsInvoices ${code} — retry ${attempt}/3 in ${attempt * 1000}ms`);
          await this.sleep(attempt * 1000);
          continue;
        }
        this.logger.warn(`getFbsInvoices final fail (code=${code}): ${JSON.stringify(body)?.slice(0, 200)}`);
        return { invoices: [] };
      }
    }
    return { invoices: [] };
  }

  async getFbsInvoiceById(storeId: string, apiKey: string, invoiceId: number | string): Promise<any | null> {
    const data = await this.executeWithRetry<{ payload: any }>(
      storeId, apiKey, `/v1/fbs/invoice/${invoiceId}`, 'GET',
      (client) => client.get(`/v1/fbs/invoice/${invoiceId}`),
    );
    return data?.payload || null;
  }

  async getFbsInvoiceOrders(storeId: string, apiKey: string, invoiceId: number | string): Promise<any[]> {
    const data = await this.executeWithRetry<{ payload: any[] }>(
      storeId, apiKey, `/v1/fbs/invoice/${invoiceId}/orders`, 'GET',
      (client) => client.get(`/v1/fbs/invoice/${invoiceId}/orders`),
    );
    return data?.payload || [];
  }

  async getFbsLabelPdf(
    storeId: string,
    apiKey: string,
    orderId: number | string,
    size: 'LARGE' | 'SMALL' = 'LARGE',
  ): Promise<string | null> {
    // Returns base64-encoded PDF (or null on failure)
    const data = await this.executeWithRetry<{ payload: { document: string } }>(
      storeId,
      apiKey,
      `/v1/fbs/order/${orderId}/labels/print`,
      'GET',
      (client) =>
        client.get(`/v1/fbs/order/${orderId}/labels/print`, {
          params: { size },
        }),
    );
    return data?.payload?.document || null;
  }

  /** Single-shot label fetch (no 60s retry-after) for batch loops */
  async getFbsLabelPdfFast(
    storeId: string,
    apiKey: string,
    orderId: number | string,
    size: 'LARGE' | 'SMALL' = 'LARGE',
  ): Promise<string | null> {
    const client = this.buildClient(apiKey);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await client.get(`/v1/fbs/order/${orderId}/labels/print`, {
          params: { size },
          timeout: 10_000,
        });
        return response.data?.payload?.document || null;
      } catch (err: any) {
        const code = err?.response?.status;
        if (code === 429 && attempt === 1) {
          await this.sleep(2000);
          continue;
        }
        this.logger.warn(`label fast fetch failed for ${orderId}: ${err?.message}`);
        return null;
      }
    }
    return null;
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  async validateConnection(
    storeId: string,
    apiKey: string,
  ): Promise<{ valid: boolean; shops: UzumShop[] }> {
    // Try /v1/shops first (most reliable identity check)
    try {
      const shops = await this.getShops(storeId, apiKey);
      return { valid: true, shops };
    } catch (err: any) {
      // If shops endpoint denied but FBS is accessible, the key still works for FBS
      // — try to validate via FBS as a fallback
      this.logger.warn(`Shops validation failed: ${err?.message}. Retrying via FBS endpoint…`);
      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
