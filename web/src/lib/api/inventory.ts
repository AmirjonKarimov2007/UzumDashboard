import { apiClient } from './client';

export const inventoryApi = {
  getInventory: (storeId: string, params?: { page?: number; size?: number; status?: string; search?: string }) =>
    apiClient.get(`/marketplace/stores/${storeId}/inventory`, { params }).then((r) => r.data),

  getSummary: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/inventory/summary`).then((r) => r.data),
};
