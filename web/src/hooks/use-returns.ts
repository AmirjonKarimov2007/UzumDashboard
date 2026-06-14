"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

function useActiveStoreId() {
  return useAuthStore((s) => s.activeStoreId);
}

export type ReturnStatus = "RETURNED" | "READY_FOR_PICKUP" | "RECEIVED" | "LOST";

export interface ReturnRow {
  id: string;
  returnId: string;
  publicId: string | null;
  uzumOrderId: string;
  productName: string;
  skuTitle: string | null;
  barcode: string | null;
  quantity: number;
  costUsd: number | null;
  salePrice: number | null;
  reason: string | null;
  status: ReturnStatus;
  manualReceived: boolean;
  orderedAt: number | null;
  returnedAt: number | null;
  receivedAt: number | null;
  daysWaiting: number | null;
}

export interface ReturnsAnalytics {
  totalItems: number;
  totalQty: number;
  totalSaleValue: number;
  totalCostUsd: number;
  lostItems: number;
  lostQty: number;
  lostCostUsd: number;
  lostSaleValue: number;
  returnRate: number | null;
  soldQty: number;
  byStatus: Record<string, number>;
  mostReturned: Array<{ name: string; sku: string; qty: number; saleValue: number }>;
  byMonth: Array<{ month: string; qty: number; saleValue: number; lost: number }>;
}

export interface ReturnsResponse {
  analytics: ReturnsAnalytics;
  returns: ReturnRow[];
  lostReport: ReturnRow[];
  lastSyncedAt: number | null;
}

export interface ReturnsFilters {
  dateFrom?: number;
  dateTo?: number;
  product?: string;
  sku?: string;
  status?: string;
}

export function useReturnsAnalytics(filters: ReturnsFilters = {}) {
  const storeId = useActiveStoreId();
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ["returns", "analytics", storeId, filters],
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      const { data } = await apiClient.get<ReturnsResponse>(
        `/marketplace/stores/${storeId}/returns/analytics`,
        {
          timeout: 90_000,
          params: {
            ...(filters.dateFrom != null ? { dateFrom: filters.dateFrom } : {}),
            ...(filters.dateTo != null ? { dateTo: filters.dateTo } : {}),
            ...(filters.product ? { product: filters.product } : {}),
            ...(filters.sku ? { sku: filters.sku } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(force ? { force: 1 } : {}),
          },
        },
      );
      return data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

// ─── Qaytarilganlar ro'yxati (Uzum nakladnoylari, jonli API) ────────────

export interface ReturnInvoiceItem {
  id: number;
  skuId: number;
  amount: number;
  packedAmount: number;
  skuTitle: string | null;
  productTitle: string | null;
  purchasePrice: number | null;
  photo: string | null;
}

export interface ReturnInvoice {
  id: number;
  dateCreated: number | null;
  status: string;
  type: string | null;
  externalNumber: string | null;
  stock?: { id: number; title: string; address: string } | null;
  executionDate?: number | null;
  assembledDate?: number | null;
  completedDate?: number | null;
  canceledDate?: number | null;
  totalAmount?: number;
  totalPackedAmount?: number;
  countAllowedChange?: number;
  maxCountAllowedChange?: number;
  returnItems?: ReturnInvoiceItem[];
}

export function useReturnInvoices(enabled = true, page = 0, size = 20) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ["returns", "invoices", storeId, page, size],
    queryFn: async () => {
      const { data } = await apiClient.get<{ invoices: ReturnInvoice[]; page: number; size: number }>(
        `/marketplace/stores/${storeId}/returns/invoices`,
        { params: { page, size }, timeout: 30_000 },
      );
      return data;
    },
    enabled: !!storeId && enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

export function useReturnInvoiceDetail(returnId: number | null) {
  const storeId = useActiveStoreId();
  return useQuery({
    queryKey: ["returns", "invoice", storeId, returnId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ invoice: ReturnInvoice | null }>(
        `/marketplace/stores/${storeId}/returns/invoices/${returnId}`,
        { timeout: 30_000 },
      );
      return data;
    },
    enabled: !!storeId && returnId != null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

