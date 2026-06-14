import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UpdateProfileBody } from '@/lib/api/users';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

export function useMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.getMe(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Persist the USD→UZS rate to the backend (User.usdRate) so the Telegram bot
 * uses the same rate. Silent — the navbar already reflects the value locally.
 */
export function useUpdateUsdRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (usdRate: number) => usersApi.updateMe({ usdRate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Kursni saqlashda xato');
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (body: UpdateProfileBody) => usersApi.updateMe(body),
    onSuccess: (updated) => {
      // Sync Zustand store so localStorage stays up-to-date — survives refresh
      if (currentUser) {
        setUser({
          ...currentUser,
          name: updated.name ?? undefined,
          email: updated.email ?? undefined,
          avatar: updated.avatar ?? undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      toast.success('Profil ma\'lumotlari saqlandi');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Saqlashda xato');
    },
  });
}
