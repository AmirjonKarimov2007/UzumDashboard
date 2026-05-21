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
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'ru',
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
    let lastError: Error;

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
          // Parse response body to distinguish "Token not found" from RBAC denial
          const responseData = (axiosErr.response?.data as any);
          const errorCode = responseData?.errors?.[0]?.code;
          const errorMsg = responseData?.errors?.[0]?.message || '';
          const rawBody = typeof responseData === 'string' ? responseData : '';

          if (errorCode === 'forbidden-001' || errorMsg.includes('Token not found')) {
            throw new UnauthorizedException(
              'Uzum API kaliti topilmadi. Uzum Seller panelga → Sozlamalar → API integratsiya bo\'limiga kiring va yangi kalit yarating'
            );
          }
          if (rawBody.includes('RBAC') || rawBody.includes('access denied')) {
            throw new UnauthorizedException(
              'Uzum API kalitingiz kerakli ruxsatlarga ega emas. Kalit "mahsulotlar", "buyurtmalar" va "moliya" ruxsatlarini o\'z ichiga olishi kerak'
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

    throw new ServiceUnavailableException(`Uzum API unavailable after ${this.maxRetries} attempts: ${lastError!.message}`);
  }

  // ─── Shops ────────────────────────────────────────────────────────────────

  async getShops(storeId: string, apiKey: string): Promise<UzumShop[]> {
    const data = await this.executeWithRetry<{ payload: UzumShop[] }>(
      storeId,
      apiKey,
      '/v1/shops',
      'GET',
      (client) => client.get('/v1/shops'),
    );
    return data.payload || [];
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async getProducts(
    storeId: string,
    apiKey: string,
    shopId: string,
    params: {
      page?: number;
      size?: number;
      filter?: string;
      sortBy?: string;
      order?: string;
    } = {},
  ): Promise<UzumPaginatedResponse<UzumProduct>> {
    const { page = 0, size = 50, filter = 'ALL', sortBy = 'DEFAULT', order = 'DESC' } = params;

    const data = await this.executeWithRetry<UzumPaginatedResponse<UzumProduct>>(
      storeId,
      apiKey,
      `/v1/product/shop/${shopId}`,
      'GET',
      (client) =>
        client.get(`/v1/product/shop/${shopId}`, {
          params: { page, size, filter, sortBy, order },
        }),
    );
    return data;
  }

  async getAllProducts(
    storeId: string,
    apiKey: string,
    shopId: string,
  ): Promise<UzumProduct[]> {
    const pageSize = 50;
    const firstPage = await this.getProducts(storeId, apiKey, shopId, { page: 0, size: pageSize });

    if (!firstPage || !firstPage.payload) return [];

    const totalPages = Math.ceil((firstPage.total || firstPage.payload.length) / pageSize);
    const allProducts = [...firstPage.payload];

    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);

    for (const page of remainingPages) {
      await this.sleep(200);
      const pageData = await this.getProducts(storeId, apiKey, shopId, { page, size: pageSize });
      if (pageData?.payload) allProducts.push(...pageData.payload);
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
    shopIds: string[],
    params: {
      page?: number;
      size?: number;
      dateFrom?: string;
      dateTo?: string;
      statuses?: string[];
    } = {},
  ): Promise<UzumPaginatedResponse<UzumFinanceOrder>> {
    const { page = 0, size = 50, dateFrom, dateTo, statuses } = params;

    const queryParams: Record<string, unknown> = { shopIds, page, size };
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;
    if (statuses?.length) queryParams.statuses = statuses;

    const data = await this.executeWithRetry<UzumPaginatedResponse<UzumFinanceOrder>>(
      storeId,
      apiKey,
      '/v1/finance/orders',
      'GET',
      (client) => client.get('/v1/finance/orders', { params: queryParams }),
    );
    return data;
  }

  async getAllFinanceOrders(
    storeId: string,
    apiKey: string,
    shopIds: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<UzumFinanceOrder[]> {
    const pageSize = 50;
    const allOrders: UzumFinanceOrder[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      await this.sleep(150);
      const response = await this.getFinanceOrders(storeId, apiKey, shopIds, {
        page,
        size: pageSize,
        dateFrom,
        dateTo,
      });

      if (!response?.payload?.length) break;

      allOrders.push(...response.payload);
      hasMore = response.payload.length === pageSize;
      page++;
    }

    return allOrders;
  }

  async getExpenses(
    storeId: string,
    apiKey: string,
    shopIds: string[],
    params: { page?: number; size?: number; dateFrom?: string; dateTo?: string } = {},
  ): Promise<UzumPaginatedResponse<UzumExpense>> {
    const { page = 0, size = 50, dateFrom, dateTo } = params;

    const queryParams: Record<string, unknown> = { shopIds, page, size };
    if (dateFrom) queryParams.dateFrom = dateFrom;
    if (dateTo) queryParams.dateTo = dateTo;

    const data = await this.executeWithRetry<UzumPaginatedResponse<UzumExpense>>(
      storeId,
      apiKey,
      '/v1/finance/expenses',
      'GET',
      (client) => client.get('/v1/finance/expenses', { params: queryParams }),
    );
    return data;
  }

  async getAllExpenses(
    storeId: string,
    apiKey: string,
    shopIds: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<UzumExpense[]> {
    const pageSize = 50;
    const allExpenses: UzumExpense[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      await this.sleep(150);
      const response = await this.getExpenses(storeId, apiKey, shopIds, {
        page,
        size: pageSize,
        dateFrom,
        dateTo,
      });

      if (!response?.payload?.length) break;

      allExpenses.push(...response.payload);
      hasMore = response.payload.length === pageSize;
      page++;
    }

    return allExpenses;
  }

  // ─── Stock ────────────────────────────────────────────────────────────────

  async getStocks(
    storeId: string,
    apiKey: string,
    shopId: string,
    page = 0,
    size = 50,
  ): Promise<UzumPaginatedResponse<UzumStock>> {
    const data = await this.executeWithRetry<UzumPaginatedResponse<UzumStock>>(
      storeId,
      apiKey,
      '/v2/fbs/sku/stocks',
      'GET',
      (client) =>
        client.get('/v2/fbs/sku/stocks', {
          params: { shopId, page, size },
        }),
    );
    return data;
  }

  async getAllStocks(
    storeId: string,
    apiKey: string,
    shopId: string,
  ): Promise<UzumStock[]> {
    const pageSize = 50;
    const allStocks: UzumStock[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      await this.sleep(150);
      const response = await this.getStocks(storeId, apiKey, shopId, page, pageSize);
      if (!response?.payload?.length) break;
      allStocks.push(...response.payload);
      hasMore = response.payload.length === pageSize;
      page++;
    }

    return allStocks;
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  async validateConnection(
    storeId: string,
    apiKey: string,
  ): Promise<{ valid: boolean; shops: UzumShop[] }> {
    const shops = await this.getShops(storeId, apiKey);
    return { valid: true, shops };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
