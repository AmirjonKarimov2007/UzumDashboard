import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

export type SmartupImport = {
  status: "SUCCESS" | "ERROR" | "PROCESSING" | "REVIEW_REQUIRED" | "NOT_FOUND";
  smartupExternalId?: string | null;
  smartupDealId?: string | null;
  errorMessage?: string | null;
  importedAt?: string | null;
};

export type FboInvoice = {
  id: number | string;
  invoiceNumber?: number | string;
  externalNumber?: string;
  deliveryCertificate?: string;
  dateCreated?: string;
  dateAccepted?: string;
  fullPrice?: number;
  totalAccepted?: number;
  totalToStock?: number;
  remainingAmountOfUpdates?: number;
  invoiceStatus?: { text?: string; color?: string; value?: string };
  stock?: { id?: number; title?: string; address?: string };
  timeSlotReservation?: { timeFrom?: string; timeTo?: string; status?: string };
  smartupImport?: SmartupImport | null;
};

export type FboSku = {
  id: number | string;
  skuTitle?: string;
  quantityToStock?: number;
  quantityAccepted?: number;
  purchasePrice?: number;
  xid?: string | null;
};

export type FboProduct = FboSku & {
  productTitle?: string;
  skuForInvoiceDtoList?: FboSku[];
};

function useActiveStoreId() {
  return useAuthStore((state) => state.activeStoreId);
}

export function useFboInvoices(page: number, size = 20) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ["fbo", "invoices", storeId, page, size],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/stores/${storeId}/fbs/fbo/invoices`, {
        params: { page, size },
      });
      return data as { invoices: FboInvoice[]; page: number; size: number; hasNext: boolean };
    },
    enabled: !!storeId,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useFboInvoiceProducts(invoiceId: string | number | null) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ["fbo", "invoice", storeId, invoiceId, "products"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/fbo/invoices/${invoiceId}/products`,
      );
      return data as { invoiceId: string; products: FboProduct[]; smartupImport?: SmartupImport | null };
    },
    enabled: !!storeId && invoiceId != null,
    staleTime: 30_000,
    retry: false,
  });
}

export function useImportFboInvoiceToSmartup() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string | number) => {
      const { data } = await apiClient.post(
        `/marketplace/stores/${storeId}/fbs/fbo/invoices/${invoiceId}/smartup/import`,
        undefined,
        { timeout: 180_000 },
      );
      return data as { ok: boolean; alreadyImported?: boolean; import?: SmartupImport };
    },
    onSuccess: (data) => toast.success(
      data.alreadyImported ? "Nakladnoy avval Smartupga tushgan" : "FBO nakladnoy Smartupga ko‘chirildi",
    ),
    onError: (error: any) => toast.error(
      error?.response?.data?.message || "FBO nakladnoyni Smartupga yuborib bo‘lmadi",
      { duration: 8_000 },
    ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["fbo"] }),
  });
}

export function useCheckFboInvoiceInSmartup() {
  const storeId = useActiveStoreId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string | number) => {
      const { data } = await apiClient.post(
        `/marketplace/stores/${storeId}/fbs/fbo/invoices/${invoiceId}/smartup/check`,
      );
      return data as { exists: boolean; message: string; smartupDealId?: string | null };
    },
    onSuccess: (data) => data.exists ? toast.success(data.message) : toast.warning(data.message),
    onError: (error: any) => toast.error(error?.response?.data?.message || "Smartup holatini tekshirib bo‘lmadi"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["fbo"] }),
  });
}
