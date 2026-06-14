import { apiClient } from './client';

export const financeApi = {
  getSummary: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/summary`, { params: { timeRange } }).then((r) => r.data),

  getExpenses: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/expenses`, { params: { timeRange } }).then((r) => r.data),

  getTransactions: (storeId: string, page = 0, size = 20, dateFrom?: string, dateTo?: string) =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/transactions`, {
      params: { page, size, dateFrom, dateTo },
    }).then((r) => r.data),

  getCashflow: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/cashflow`, { params: { timeRange } }).then((r) => r.data),

  getCommission: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/commission`, { params: { timeRange } }).then((r) => r.data),

  getRoi: (storeId: string, timeRange = 'month') =>
    apiClient.get(`/marketplace/stores/${storeId}/finance/roi`, { params: { timeRange } }).then((r) => r.data),

  /**
   * Live balance reconciliation pulled from Uzum's finance/orders + finance/expenses.
   * Returns the full breakdown: gross revenue, commission, transfers, withdrawals, other expenses, computed balance.
   * Dates as unix ms strings.
   *
   * Override the global 30s timeout: first fetch paginates through Uzum's full finance
   * history and is rate-limited, often taking 60-150s. Subsequent calls hit the 5-min
   * backend cache and return in <100ms.
   */
  getReconciliation: (storeId: string, dateFrom?: number, dateTo?: number) =>
    apiClient
      .get(`/marketplace/stores/${storeId}/finance/reconciliation`, {
        timeout: 180_000,
        params: {
          ...(dateFrom != null ? { dateFrom: String(dateFrom) } : {}),
          ...(dateTo != null ? { dateTo: String(dateTo) } : {}),
        },
      })
      .then((r) => r.data as ReconciliationResponse),
};

export interface ReconciliationResponse {
  dateFrom: number;
  dateTo: number;
  dataSources: {
    orders: 'uzum' | 'local' | 'none';
    expenses: 'uzum' | 'local' | 'none';
    errors: string[];
  };
  sales: {
    ordersCount: number;
    grossRevenue: number;
    totalCommission: number;
    totalLogistics: number;
    totalTransfer: number;
    avgOrderValue: number;
    commissionRate: number;
    logisticsRate: number;
    byStatus: Record<string, { count: number; transfer: number; commission: number; gross: number }>;
  };
  profit: {
    gross: number;
    netAfterUzumCuts: number;
    netProfit: number;
    netProfitMargin: number;
  };
  withdrawals: {
    list: Array<{
      id: string;
      uzumRef?: string;
      amount: number;
      date: number | null;
      description: string;
      type: string;
      status?: string;
    }>;
    total: number;
    count: number;
  };
  fines: {
    list: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      date: number | null;
      status?: string;
    }>;
    total: number;
    count: number;
  };
  services: {
    list: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      direction: 'income' | 'outcome';
      date: number | null;
      status: string;
    }>;
    totalIncome: number;
    totalOutcome: number;
    net: number;
    count: number;
    byStatus: Record<string, { count: number; income: number; outcome: number; net: number }>;
  };
  otherExpenses: {
    list: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      date: number | null;
    }>;
    total: number;
    count: number;
  };
  expensesByType: Array<{
    type: string;
    count: number;
    total: number;
    sample?: string;
    classified: 'withdrawal' | 'fine' | 'service' | 'other';
  }>;
  balance: {
    computed: number;
    formula: string;
    breakdown: {
      totalTransfer: number;
      minusWithdrawals: number;
      minusFines: number;
      minusServicesNet: number;
      minusOtherExpenses: number;
      equalsBalance: number;
    };
  };
}