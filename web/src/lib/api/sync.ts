import { apiClient } from './client';

export const syncApi = {
  triggerFullSync: (storeId: string) =>
    apiClient.post(`/marketplace/stores/${storeId}/sync/full`).then((r) => r.data),

  triggerOrdersSync: (storeId: string, dateFrom?: string, dateTo?: string) =>
    apiClient.post(`/marketplace/stores/${storeId}/sync/orders`, null, {
      params: { dateFrom, dateTo },
    }).then((r) => r.data),

  triggerProductsSync: (storeId: string) =>
    apiClient.post(`/marketplace/stores/${storeId}/sync/products`).then((r) => r.data),

  triggerInventorySync: (storeId: string) =>
    apiClient.post(`/marketplace/stores/${storeId}/sync/inventory`).then((r) => r.data),

  getSyncStatus: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/sync/status`).then((r) => r.data),
};
