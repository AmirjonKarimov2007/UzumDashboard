import { apiClient } from './client';

export const productsApi = {
  getProducts: (storeId: string, params?: {
    page?: number; size?: number; search?: string;
    status?: string; category?: string; sortBy?: string; order?: string;
  }) =>
    apiClient.get(`/marketplace/stores/${storeId}/products`, { params }).then((r) => r.data),

  getProduct: (storeId: string, productId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/products/${productId}`).then((r) => r.data),

  getSummary: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/products/summary`).then((r) => r.data),

  getTopProducts: (storeId: string, limit = 10) =>
    apiClient.get(`/marketplace/stores/${storeId}/products/top`, { params: { limit } }).then((r) => r.data),
};
