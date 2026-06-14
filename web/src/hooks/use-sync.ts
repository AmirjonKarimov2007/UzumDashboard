import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncApi } from '@/lib/api/sync';
import { storesApi } from '@/lib/api/stores';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export function useSyncStatus() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['sync', 'status', storeId],
    queryFn: () => syncApi.getSyncStatus(storeId!),
    enabled: !!storeId,
    // Cache for 30s so navigating between pages doesn't re-fetch (and flash a
    // loader) on every mount. Only poll quickly while a sync job is actually
    // running; otherwise back off to 60s.
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const d: any = query.state.data;
      const busy = d && ((d.activeJobs ?? 0) > 0 || (d.queuedJobs ?? 0) > 0);
      return busy ? 5_000 : 60_000;
    },
  });
}

export function useFullSync() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncApi.triggerFullSync(storeId!),
    onSuccess: () => {
      toast.success("To'liq sinxronizatsiya boshlandi");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['sync'] });
      }, 3000);
    },
    onError: () => toast.error('Sinxronizatsiya xatosi'),
  });
}

export function useConnectStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      uzumShopId,
      apiKey,
      autoSync,
    }: { storeId: string; uzumShopId: string; apiKey: string; autoSync?: boolean }) =>
      storesApi.connectStore(storeId, { uzumShopId, apiKey, autoSync }),
    onSuccess: (data: any, vars) => {
      // Backend may self-heal a stale/missing storeId and return the real one —
      // adopt it so subsequent calls (sync status, products, etc.) use the right store.
      if (data?.storeId && data.storeId !== vars.storeId) {
        useAuthStore.getState().setActiveStoreId(data.storeId);
      }
      if (data?.warning) {
        // Saved but validation failed — show specific warning
        toast.warning(data.warning, { duration: 8000 });
      } else {
        toast.success("Do'kon muvaffaqiyatli ulandi!");
      }
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['sync', 'status', data?.storeId || vars.storeId] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Ulanish xatosi';
      toast.error(msg, { duration: 8000 });
    },
  });
}

export function useTestConnection() {
  const storeId = useActiveStoreId();
  return useMutation({
    mutationFn: () => storesApi.testConnection(storeId!),
  });
}

export function useDisconnectStore() {
  const queryClient = useQueryClient();
  const storeId = useActiveStoreId();
  return useMutation({
    mutationFn: () => storesApi.disconnectStore(storeId!),
    onSuccess: () => {
      toast.success("Do'kon uzildi — endi boshqa foydalanuvchi ulashi mumkin");
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['sync', 'status', storeId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || "Uzishda xato");
    },
  });
}
