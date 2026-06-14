import { apiClient } from './client';

export const storesApi = {
  getStores: () =>
    apiClient.get('/marketplace/stores').then((r) => r.data),

  getStore: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}`).then((r) => r.data),

  connectStore: (storeId: string, body: { uzumShopId: string; apiKey: string; autoSync?: boolean }) =>
    apiClient.post(`/marketplace/stores/${storeId}/connect`, body).then((r) => r.data),

  disconnectStore: (storeId: string) =>
    apiClient.post(`/marketplace/stores/${storeId}/disconnect`).then((r) => r.data),

  testConnection: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/test-connection`).then((r) => r.data),

  updateConnectionSettings: (storeId: string, body: { autoSync: boolean }) =>
    apiClient.patch(`/marketplace/stores/${storeId}/connection-settings`, body).then((r) => r.data),
};
