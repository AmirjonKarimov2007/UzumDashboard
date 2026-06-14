import { apiClient } from './client';

export const ordersApi = {
  getOrders: (storeId: string, params?: {
    page?: number; size?: number; search?: string;
    status?: string; dateFrom?: string; dateTo?: string;
  }) =>
    apiClient.get(`/marketplace/stores/${storeId}/orders`, { params }).then((r) => r.data),

  getOrder: (storeId: string, orderId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/orders/${orderId}`).then((r) => r.data),

  getSummary: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/orders/summary`).then((r) => r.data),

  getRecentOrders: (storeId: string, limit = 10) =>
    apiClient.get(`/marketplace/stores/${storeId}/orders/recent`, { params: { limit } }).then((r) => r.data),
};
