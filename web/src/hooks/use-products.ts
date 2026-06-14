import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '@/lib/api/products';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

// ─── Product meta (cost price, article code, XID) — seller-entered overrides ──
export interface ProductMetaEntry {
  costPrice: number | null;
  articleCode: string | null;
  xid: string | null;
}

export function useProductMeta() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['product-meta', storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/stores/${storeId}/product-meta`);
      return (data?.meta ?? {}) as Record<string, ProductMetaEntry>;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertProductMeta() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { skuId: string | number; costPrice?: number | null; articleCode?: string | null; xid?: string | null; productId?: string | number | null }) => {
      const { skuId, ...body } = vars;
      const { data } = await apiClient.put(
        `/marketplace/stores/${storeId}/product-meta/${skuId}`,
        { ...body, productId: body.productId != null ? String(body.productId) : undefined },
      );
      return data as ProductMetaEntry & { skuId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-meta', storeId] });
      toast.success('Saqlandi');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Saqlashda xato');
    },
  });
}

/** Live products fetched directly from Uzum API (no DB cache).
 *  Note: Uzum API ignores the `order` param so we omit it here — caller
 *  must implement order client-side. */
export function useLiveProducts(
  params?: {
    page?: number;
    size?: number;
    filter?: string;
    search?: string;
    sortBy?: string;
  },
  enabled: boolean = true,
) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['products', 'live', storeId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/products`,
        { params, timeout: 25_000 },
      );
      return data as { products: any[]; total: number; page: number; size: number };
    },
    enabled: enabled && !!storeId,
    staleTime: 60 * 1000,
    // Fail fast instead of 3× 30s timeouts (which looked like an endless spinner).
    retry: 1,
    retryDelay: 800,
    refetchOnWindowFocus: false,
  });
}

// ─── Product-level analytics (aggregated, live from Uzum) ────────────────────
export interface ProductAnalyticsRow {
  productId: number;
  title: string;
  image: string | null;
  category: string;
  price: number;
  sold: number;
  returned: number;
  returnedPct: number;
  stock: number;
  viewers: number;
  conversion: number;
  viewToSale: number;
  rating: number;
  feedback: number;
  roi: number;
  rank: string;
  skuCount: number;
  turnover: number;
  statusValue: string;
  statusTitle: string;
}

export interface ProductAnalyticsResponse {
  totals: {
    products: number; active: number; inStock: number;
    totalViewers: number; totalSold: number; totalReturned: number; totalFeedback: number;
    avgRating: number; avgViewToSale: number; returnRate: number;
    inventoryUnits: number; inventoryValue: number; turnover: number;
  };
  funnel: { viewers: number; sold: number; returned: number };
  rankDist: Record<string, number>;
  categories: { name: string; count: number; sold: number; turnover: number }[];
  products: ProductAnalyticsRow[];
}

export function useProductAnalytics() {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);
  const query = useQuery({
    queryKey: ['products', 'analytics', storeId],
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<ProductAnalyticsResponse>(
        `/marketplace/stores/${storeId}/fbs/products/analytics`,
        { timeout: 90_000, params: force ? { force: 1 } : undefined },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
  const refresh = () => { forceRef.current = true; return query.refetch(); };
  return { ...query, refresh };
}

export function useProducts(params?: {
  page?: number; size?: number; search?: string;
  status?: string; category?: string; sortBy?: string; order?: string;
}) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['products', storeId, params],
    queryFn: () => productsApi.getProducts(storeId!, params),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProduct(productId: string) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['products', storeId, productId],
    queryFn: () => productsApi.getProduct(storeId!, productId),
    enabled: !!storeId && !!productId,
  });
}

export function useProductSummary() {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['products', 'summary', storeId],
    queryFn: () => productsApi.getSummary(storeId!),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopProducts(limit = 10) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ['products', 'top', storeId, limit],
    queryFn: () => productsApi.getTopProducts(storeId!, limit),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
