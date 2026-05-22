import { Injectable, Logger } from '@nestjs/common';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class FbsService {
  private readonly logger = new Logger(FbsService.name);

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
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    return this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size);
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
    const results = await Promise.all(
      orderIds.map(async (orderId) => {
        try {
          const base64 = await this.uzumClient.getFbsLabelPdf(storeId, apiKey, orderId, size);
          return { orderId, ok: !!base64, document: base64 };
        } catch (err: any) {
          this.logger.warn(`Label fetch failed for order ${orderId}: ${err?.message}`);
          return { orderId, ok: false, error: err?.message };
        }
      }),
    );
    return {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
}
