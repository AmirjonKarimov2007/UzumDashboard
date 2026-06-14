import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api/orders';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export function useConfirmFbsOrder() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number | string) => {
      const { data } = await apiClient.post(`/marketplace/stores/${storeId}/fbs/orders/${orderId}/confirm`);
      return data as { ok: boolean; order?: any; error?: string };
    },
    onSuccess: (data, orderId) => {
      if (data.ok) {
        toast.success(`Buyurtma #${orderId} tasdiqlandi — Yig'ishdagilarga ko'chdi`);

        // Optimistically move the badge counts instantly: CREATED −1, PACKING +1.
        // Uzum's /count endpoint is eventually-consistent and may still report the
        // old numbers for a few seconds, so we update locally first, then reconcile.
        queryClient.setQueriesData<Record<string, number>>(
          { queryKey: ['fbs', 'orderCounts', storeId] },
          (old) => old
            ? { ...old, CREATED: Math.max(0, (old.CREATED ?? 0) - 1), PACKING: (old.PACKING ?? 0) + 1 }
            : old,
        );
        // Refresh the order lists right away (these are accurate immediately)
        queryClient.invalidateQueries({ queryKey: ['fbs', 'orders', storeId] });
        // Reconcile counts with Uzum after it settles (avoid overwriting the
        // optimistic value with a stale count fetched too early).
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['fbs', 'orderCounts', storeId] });
        }, 4000);
      } else {
        toast.error(data.error || 'Tasdiqlashda xato');
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Tasdiqlashda xato');
    },
  });
}

/** Cancel reasons (cached on the server) */
export function useFbsReturnReasons() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['fbs', 'returnReasons', storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/stores/${storeId}/fbs/return-reasons`);
      return data as Array<{ reason: string }>;
    },
    enabled: !!storeId,
    staleTime: 60 * 60 * 1000,
  });
}

/** Cancel an FBS order with a reason */
export function useCancelFbsOrder() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason, comment }: { orderId: number | string; reason: string; comment?: string }) => {
      const { data } = await apiClient.post(
        `/marketplace/stores/${storeId}/fbs/orders/${orderId}/cancel`,
        { reason, comment },
      );
      return data as { ok: boolean; error?: string; code?: string };
    },
    onSuccess: (data, { orderId }) => {
      if (data.ok) {
        toast.success(`Buyurtma #${orderId} bekor qilindi`);
        queryClient.invalidateQueries({ queryKey: ['fbs', 'orders', storeId] });
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['fbs', 'orderCounts', storeId] }), 3000);
      } else {
        toast.error(data.error || 'Bekor qilishda xato');
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Bekor qilishda xato');
    },
  });
}

/** DBS order lifecycle actions (delivering → completed → refund) */
export function useDbsOrderAction() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, action, issueCode }: { orderId: number | string; action: 'delivering' | 'completed' | 'refund'; issueCode?: number }) => {
      const params = action === 'completed' && issueCode != null ? { issueCode } : undefined;
      const { data } = await apiClient.post(
        `/marketplace/stores/${storeId}/fbs/dbs/orders/${orderId}/${action}`,
        undefined,
        { params },
      );
      return data as { ok: boolean; error?: string; code?: string };
    },
    onSuccess: (data, { action }) => {
      const labels: Record<string, string> = { delivering: "Yetkazishga berildi", completed: "Topshirildi", refund: "Qaytarish yaratildi" };
      if (data.ok) {
        toast.success(labels[action] || "Bajarildi");
        queryClient.invalidateQueries({ queryKey: ['fbs', 'orders', storeId] });
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['fbs', 'orderCounts', storeId] }), 3000);
      } else {
        toast.error(data.error || "Amal bajarilmadi");
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Amal bajarilmadi"),
  });
}

/** Live FBS orders for a single status */
export function useFbsOrders(params: {
  status: string;
  page?: number;
  size?: number;
  scheme?: 'FBS' | 'DBS';
  dateFrom?: number;
  dateTo?: number;
}) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['fbs', 'orders', storeId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/orders`,
        { params },
      );
      return data as { orders: any[] };
    },
    enabled: !!storeId,
    staleTime: 30 * 1000,
  });
}

/** Counts for every FBS status (parallel) — feeds the tab badges */
export function useFbsOrderCounts(params?: { dateFrom?: number; dateTo?: number }) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['fbs', 'orderCounts', storeId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/orders/counts`,
        { params },
      );
      return data as Record<string, number>;
    },
    enabled: !!storeId,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

// ─── FBS Invoices (Ta'minlashlar) ──────────────────────────────────────

export function useFbsInvoices(params?: { statuses?: string; page?: number; size?: number }) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['fbs', 'invoices', storeId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/invoices`,
        { params },
      );
      return data as { invoices: any[] };
    },
    enabled: !!storeId,
    staleTime: 30 * 1000,
  });
}

export function useFbsInvoiceOrders(invoiceId: number | string | null) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['fbs', 'invoice', storeId, invoiceId, 'orders'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/invoices/${invoiceId}/orders`,
      );
      return data as { orders: any[] };
    },
    enabled: !!storeId && !!invoiceId,
    staleTime: 60 * 1000,
  });
}

export function useOrders(params?: {
  page?: number; size?: number; search?: string;
  status?: string; dateFrom?: string; dateTo?: string;
}) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['orders', storeId, params],
    queryFn: () => ordersApi.getOrders(storeId!, params),
    enabled: !!storeId,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useOrder(orderId: string) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['orders', storeId, orderId],
    queryFn: () => ordersApi.getOrder(storeId!, orderId),
    enabled: !!storeId && !!orderId,
  });
}

export function useOrderSummary() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['orders', 'summary', storeId],
    queryFn: () => ordersApi.getSummary(storeId!),
    enabled: !!storeId,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRecentOrders(limit = 10) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['orders', 'recent', storeId, limit],
    queryFn: () => ordersApi.getRecentOrders(storeId!, limit),
    enabled: !!storeId,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
