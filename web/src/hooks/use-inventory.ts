import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/stores/auth-store';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export function useInventory(params?: { page?: number; size?: number; status?: string; search?: string }) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['inventory', storeId, params],
    queryFn: () => inventoryApi.getInventory(storeId!, params),
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useInventorySummary() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['inventory', 'summary', storeId],
    queryFn: () => inventoryApi.getSummary(storeId!),
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
  });
}
