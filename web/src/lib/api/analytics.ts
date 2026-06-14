import { apiClient } from './client';

export const analyticsApi = {
  getDashboard: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/dashboard`, { params: { timeRange } }).then((r) => r.data),

  getRevenueChart: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/revenue-chart`, { params: { timeRange } }).then((r) => r.data),

  getCategories: (storeId: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/categories`).then((r) => r.data),

  getFinanceSummary: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/finance`, { params: { timeRange } }).then((r) => r.data),

  getExpenseBreakdown: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/expenses`, { params: { timeRange } }).then((r) => r.data),

  getTransactions: (storeId: string, page = 0, size = 20, dateFrom?: string, dateTo?: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/analytics/transactions`, {
      params: { page, size, dateFrom, dateTo },
    }).then((r) => r.data),
};
