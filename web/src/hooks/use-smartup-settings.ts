import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '@/lib/api/stores';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

export function useSmartupSettings() {
  const storeId = useAuthStore((state) => state.activeStoreId);

  return useQuery({
    queryKey: ['stores', storeId, 'smartup-settings'],
    queryFn: () => storesApi.getSmartupSettings(storeId!),
    enabled: Boolean(storeId),
    staleTime: 30_000,
  });
}

export function useUpdateSmartupSettings() {
  const storeId = useAuthStore((state) => state.activeStoreId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: string) => storesApi.updateSmartupSettings(storeId!, { clientId }),
    onSuccess: (settings) => {
      queryClient.setQueryData(['stores', storeId, 'smartup-settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success(`Smartup klienti ${settings.effectiveClientId} ga o'zgartirildi`);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Smartup sozlamasini saqlab bo\'lmadi');
    },
  });
}
