import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { financeApi } from '@/lib/api/finance';
import { useAuthStore } from '@/stores/auth-store';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export function useFinanceSummary(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'summary', storeId, timeRange],
    queryFn: () => financeApi.getSummary(storeId!, timeRange),
    enabled: !!storeId,
  });
}

export function useFinanceExpenses(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'expenses', storeId, timeRange],
    queryFn: () => financeApi.getExpenses(storeId!, timeRange),
    enabled: !!storeId,
  });
}

export function useFinanceTransactions(page = 0, dateFrom?: string, dateTo?: string) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'transactions', storeId, page, dateFrom, dateTo],
    queryFn: () => financeApi.getTransactions(storeId!, page, 20, dateFrom, dateTo),
    enabled: !!storeId,
  });
}

export function useFinanceCashflow(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'cashflow', storeId, timeRange],
    queryFn: () => financeApi.getCashflow(storeId!, timeRange),
    enabled: !!storeId,
  });
}

export function useFinanceCommission(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'commission', storeId, timeRange],
    queryFn: () => financeApi.getCommission(storeId!, timeRange),
    enabled: !!storeId,
  });
}

export function useFinanceRoi(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['finance', 'roi', storeId, timeRange],
    queryFn: () => financeApi.getRoi(storeId!, timeRange),
    enabled: !!storeId,
  });
}

/**
 * Full balance reconciliation pulled live from Uzum.
 * Pass dateFrom/dateTo as unix ms; defaults to ~2 years back on the server.
 *
 * Cached aggressively (10 min stale, no refetch on mount/focus) because this
 * paginates through Uzum's finance API and counts against the daily rate limit.
 * To force a refresh, call refetch() from the returned object.
 */
/**
 * Lightweight logistics+fines totals from a single /v1/finance/expenses call.
 * Used by the slimmed-down Moliya page that only shows 3 cards.
 */
interface ExpenseItem { id: string; amount: number; source: string; description: string; date: number | null; status: string }

export interface LogisticsFinesResponse {
  logisticsTotal: number;
  logisticsCount: number;
  finesTotal: number;
  finesCount: number;
  marketingTotal: number;
  marketingCount: number;
  marketing: ExpenseItem[];
  storageTotal: number;
  storageCount: number;
  storage: ExpenseItem[];
  extensionTotal: number;
  extensionCount: number;
  extensions: ExpenseItem[];
  otherTotal: number;
  otherCount: number;
  other: ExpenseItem[];
  combined: number;
  refundsTotal: number;
  refundsCount: number;
  totalExpenses: number;
  fbsOrdersCount: number;
  requestedSize: number;
  logistics: ExpenseItem[];
  fines: ExpenseItem[];
  refunds: ExpenseItem[];
}

export interface ProcessingWithdrawResponse {
  processing: {
    total: number;
    grossAfterCommission: number;
    netAfterLogistics: number;
    logistics: number;
    commission: number;
    grossSales: number;
    withdrawn: number;
    count: number;
    itemsCount: number;
    apiTotal: number;
    costUsd: number;
    costedQty: number;
    unpricedQty: number;
    totalQty: number;
    costCoveragePercent: number;
  };
  withdraw: {
    total: number;
    grossAfterCommission: number;
    netAfterLogistics: number;
    logistics: number;
    commission: number;
    grossSales: number;
    withdrawn: number;
    count: number;
    itemsCount: number;
    apiTotal: number;
    historyGrossTotal: number;
    historyWithdrawnTotal: number;
    historyItemsCount: number;
    costUsd: number;
    costedQty: number;
    unpricedQty: number;
    totalQty: number;
    costCoveragePercent: number;
  };
  combined: number;
  currentCostUsd: number;
  fbsActiveOrders: number;
  requestedSize: number;
  calculatedAt: number;
  formulas: {
    processing: string;
    available: string;
    cost: string;
  };
}

export interface ManualWithdrawalEntry {
  id: string;
  reference: string | null;
  status: string;
  amount: number;
  occurredAt: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualWithdrawalsResponse {
  entries: ManualWithdrawalEntry[];
  total: number;
  count: number;
}

export type ManualWithdrawalInput = {
  amount: number;
  occurredAt: string;
  reference?: string;
  status?: string;
  note?: string;
};

export function useManualWithdrawals(dateFrom?: number, dateTo?: number) {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  const queryKey = ['finance', 'manual-withdrawals', storeId, dateFrom, dateTo] as const;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'manual-withdrawals', storeId] });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.get<ManualWithdrawalsResponse>(
        `/marketplace/stores/${storeId}/finance/manual-withdrawals`,
        { params: { ...(dateFrom != null ? { dateFrom } : {}), ...(dateTo != null ? { dateTo } : {}) } },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: ManualWithdrawalInput) => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.post(`/marketplace/stores/${storeId}/finance/manual-withdrawals`, input);
      return data as ManualWithdrawalEntry;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: ManualWithdrawalInput & { id: string }) => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.patch(`/marketplace/stores/${storeId}/finance/manual-withdrawals/${id}`, input);
      return data as ManualWithdrawalEntry;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { apiClient } = await import('@/lib/api/client');
      await apiClient.delete(`/marketplace/stores/${storeId}/finance/manual-withdrawals/${id}`);
    },
    onSuccess: invalidate,
  });

  return { ...query, create, update, remove };
}

export interface SupplierPaymentEntry {
  id: string;
  supplierName: string;
  amount: number;
  occurredAt: number;
  paymentMethod: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentsResponse {
  entries: SupplierPaymentEntry[];
  total: number;
  count: number;
  bySupplier: Array<{ supplierName: string; amount: number }>;
}

export type SupplierPaymentInput = {
  supplierName: string;
  amount: number;
  occurredAt: string;
  paymentMethod?: string;
  reference?: string;
  note?: string;
};

export function useSupplierPayments(dateFrom?: number, dateTo?: number) {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  const queryKey = ['finance', 'supplier-payments', storeId, dateFrom, dateTo] as const;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'supplier-payments', storeId] });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.get<SupplierPaymentsResponse>(
        `/marketplace/stores/${storeId}/finance/supplier-payments`,
        { params: { ...(dateFrom != null ? { dateFrom } : {}), ...(dateTo != null ? { dateTo } : {}) } },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: SupplierPaymentInput) => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.post(`/marketplace/stores/${storeId}/finance/supplier-payments`, input);
      return data as SupplierPaymentEntry;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: SupplierPaymentInput & { id: string }) => {
      const { apiClient } = await import('@/lib/api/client');
      const { data } = await apiClient.patch(`/marketplace/stores/${storeId}/finance/supplier-payments/${id}`, input);
      return data as SupplierPaymentEntry;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { apiClient } = await import('@/lib/api/client');
      await apiClient.delete(`/marketplace/stores/${storeId}/finance/supplier-payments/${id}`);
    },
    onSuccess: invalidate,
  });

  return { ...query, create, update, remove };
}

export interface DashboardSummaryResponse {
  timeRange: string;
  dateFrom: number;
  dateTo: number;
  revenue: number;        // Jami daromad (sellerProfit, UZS)
  orders: number;         // Davrda tushgan buyurtmalar
  unitsSold: number;      // Sotilgan birliklar (jami dona)
  activeProducts: number; // Faol mahsulotlar
  costUsd: number;        // Sotilgan mahsulotlar tan narxi (USD jami)
  coverage: {
    skusWithCost: number;
    skusSold: number;
    costedQty: number;
    totalSoldQty: number;
  };
  financeItems: number;
  // Vidjetlar (davr/sana bo'yicha)
  chart: { name: string; revenue: number; costUsd: number; orders: number; qty: number }[];
  categories: { name: string; revenue: number; percentage: number }[];
  topProducts: { id: string; name: string; revenue: number; soldCount: number; image?: string }[];
  recentOrders: { id: string; orderId: number | string; name: string; sub: string; total: number; status: string; date: number; image?: string }[];
}

/** Custom sana oralig'i (ms). Berilsa, preset timeRange'ni inkor qiladi. */
export interface DashboardDateRange {
  dateFrom: number;
  dateTo: number;
}

export interface SoldProductsSummaryResponse {
  timeRange: string;
  dateFrom: number;
  dateTo: number;
  totals: {
    products: number;
    shown: number;
    orders: number;
    unitsSold: number;
    returnedUnits: number;
    revenue: number;
  };
  products: {
    id: string;
    productId: string;
    skuTitle: string;
    name: string;
    category: string;
    image?: string;
    soldCount: number;
    returnedCount: number;
    revenue: number;
    ordersCount: number;
    lastSoldAt: number;
  }[];
}

export function useDashboardSummary(timeRange = 'today', custom?: DashboardDateRange | null) {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);
  const hasCustom = !!custom && custom.dateFrom > 0 && custom.dateTo > 0;

  const query = useQuery({
    queryKey: hasCustom
      ? ['finance', 'dashboard-summary', storeId, 'custom', custom!.dateFrom, custom!.dateTo]
      : ['finance', 'dashboard-summary', storeId, timeRange],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<DashboardSummaryResponse>(
        `/marketplace/stores/${storeId}/finance/dashboard-summary`,
        {
          timeout: 90_000,
          params: {
            timeRange,
            ...(hasCustom ? { dateFrom: custom!.dateFrom, dateTo: custom!.dateTo } : {}),
            ...(force ? { force: 1 } : {}),
          },
        },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

export function useSoldProductsSummary(timeRange = 'today', custom?: DashboardDateRange | null, limit = 200) {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);
  const hasCustom = !!custom && custom.dateFrom > 0 && custom.dateTo > 0;

  const query = useQuery({
    queryKey: hasCustom
      ? ['finance', 'sold-products', storeId, 'custom', custom!.dateFrom, custom!.dateTo, limit]
      : ['finance', 'sold-products', storeId, timeRange, limit],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<SoldProductsSummaryResponse>(
        `/marketplace/stores/${storeId}/finance/sold-products`,
        {
          timeout: 90_000,
          params: {
            timeRange,
            limit,
            ...(hasCustom ? { dateFrom: custom!.dateFrom, dateTo: custom!.dateTo } : {}),
            ...(force ? { force: 1 } : {}),
          },
        },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

export function useProcessingAndWithdraw() {
  const storeId = useActiveStoreId();
  // Ref toggle — when set, the NEXT fetch sends ?force=1 to bypass the
  // 5-min backend cache. The user's "Yangilash" button sets this via refresh().
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ['finance', 'processing-withdraw', storeId],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<ProcessingWithdrawResponse>(
        `/marketplace/stores/${storeId}/finance/processing-withdraw`,
        { timeout: 90_000, params: force ? { force: 1 } : undefined },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

export function useLogisticsAndFines() {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ['finance', 'logistics-fines', storeId],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<LogisticsFinesResponse>(
        `/marketplace/stores/${storeId}/finance/logistics-fines`,
        { timeout: 90_000, params: force ? { force: 1 } : undefined },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

export function useFinanceReconciliation(dateFrom?: number, dateTo?: number) {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);
  const query = useQuery({
    queryKey: ['finance', 'reconciliation', storeId, dateFrom, dateTo],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get(`/marketplace/stores/${storeId}/finance/reconciliation`, {
        timeout: 120_000,
        params: { ...(dateFrom != null ? { dateFrom } : {}), ...(dateTo != null ? { dateTo } : {}), ...(force ? { force: 1 } : {}) },
      });
      return data;
    },
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000, // 10 min — heavy Uzum API call, cache hard
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Backend caches successful fetches; retrying a timeout/rate-limit just wastes
    // another 3 minutes. User can hit "Yangilash" manually if they want to retry.
    retry: 0,
  });
  const refresh = () => { forceRef.current = true; return query.refetch(); };
  return { ...query, refresh };
}
