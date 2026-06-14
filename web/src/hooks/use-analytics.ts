import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api/analytics';
import { useAuthStore } from '@/stores/auth-store';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export function useDashboardMetrics(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'dashboard', storeId, timeRange],
    queryFn: () => analyticsApi.getDashboard(storeId!, timeRange),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRevenueChart(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'revenue-chart', storeId, timeRange],
    queryFn: () => analyticsApi.getRevenueChart(storeId!, timeRange),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategoryBreakdown() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'categories', storeId],
    queryFn: () => analyticsApi.getCategories(storeId!),
    enabled: !!storeId,
    staleTime: 15 * 60 * 1000,
  });
}

export function useFinanceSummary(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'finance', storeId, timeRange],
    queryFn: () => analyticsApi.getFinanceSummary(storeId!, timeRange),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpenseBreakdown(timeRange = 'month') {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'expenses', storeId, timeRange],
    queryFn: () => analyticsApi.getExpenseBreakdown(storeId!, timeRange),
    enabled: !!storeId,
    staleTime: 15 * 60 * 1000,
  });
}

export function useTransactions(page = 0, size = 20) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['analytics', 'transactions', storeId, page, size],
    queryFn: () => analyticsApi.getTransactions(storeId!, page, size),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}
