import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export interface FbsStockItem {
  skuId: number;
  skuTitle: string;
  productTitle: string;
  barcode: string;
  amount: number;
  fbsLinked: boolean;
  fbsAllowed: boolean;
  dbsLinked: boolean;
  dbsAllowed: boolean;
  sellerSkuCode: string | null;
  image: string | null;
  productId: number | null;
  price: number;
  purchasePrice: number;
  sold: number;
  category: string;
  article: string;
}

export interface FbsStocksResponse {
  stocks: FbsStockItem[];
  total: number;
  totalUnits: number;
  totalValue: number;
  inStock: number;
  outOfStock: number;
}

/** Live FBS SKU stocks (enriched with product info). */
export function useFbsStocks() {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ['fbs', 'stocks', storeId],
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<FbsStocksResponse>(
        `/marketplace/stores/${storeId}/fbs/stocks`,
        { timeout: 90_000, params: force ? { force: 1 } : undefined },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

/** Update FBS stock amounts (partial — only listed SKUs change). */
export function useSetFbsStocks() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Array<{ skuId: number; amount: number }>) => {
      const { data } = await apiClient.post(
        `/marketplace/stores/${storeId}/fbs/stocks`,
        { updates },
        { timeout: 60_000 },
      );
      return data as { totalRecords: number; updatedRecords: number; skipped?: number[] };
    },
    onSuccess: (data) => {
      toast.success(`${data.updatedRecords} ta qoldiq yangilandi`);
      queryClient.invalidateQueries({ queryKey: ['fbs', 'stocks', storeId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Qoldiqlarni yangilashda xato');
    },
  });
}
