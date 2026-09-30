"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

interface CheckResult {
  checkedAt: string;
  priceCheckedAt: string;
  priceType: string;
  total: number;
  ready: number;
  missingXid: number;
  missingPrice: number;
  rows: Array<{ skuId: string; productId: string; title: string; xid: string | null; price: string | null; status: string }>;
}

export function SmartupProductCheck({ onFindProduct }: { onFindProduct: (id: string) => void }) {
  const storeId = useAuthStore((state) => state.activeStoreId);
  const check = useQuery({
    queryKey: ["smartup-product-check", storeId],
    queryFn: async () => (await apiClient.get<CheckResult>(
      `/marketplace/stores/${storeId}/fbs/smartup/check-products`, { timeout: 120_000 },
    )).data,
    enabled: false,
    retry: false,
  });
  const result = check.data;
  const problems = result?.rows.filter((row) => row.status !== "READY") || [];
  const error = check.error as { response?: { data?: { message?: string } } } | null;

  return (
    <section aria-label="Smartup mahsulot tekshiruvi" className="rounded-2xl border border-[#1c1c24] bg-[#0f0f16] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e4e4e7]">Smartup tekshiruvi</h2>
          <p className="mt-1 text-xs text-[#a1a1aa]">SKU XID va narxlarni tekshiring. Bu amal nakladnoy yaratmaydi.</p>
        </div>
        <button type="button" onClick={() => check.refetch()} disabled={!storeId || check.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-[#3f3f46] px-3 py-2 text-xs text-[#e4e4e7] hover:bg-[#27272a] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a78bfa]">
          <RefreshCw className={`h-3.5 w-3.5 ${check.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {check.isFetching ? "Tekshirilmoqda…" : "XID va narxlarni tekshirish"}
        </button>
      </div>
      {check.isError && <p role="alert" className="text-sm text-[#fbbf24]">{error?.response?.data?.message || "Smartup bilan bog‘lanib bo‘lmadi. Ulanish sozlamalarini tekshirib, qayta urinib ko‘ring."}</p>}
      {result && !check.isError && (
        <div aria-live="polite" className="space-y-3">
          <p className="text-xs text-[#a1a1aa]">
            Tekshirilgan: {result.total} SKU. <span className="text-[#34d399]">XID va narxi mavjud: {result.ready}.</span>{" "}
            XID yo‘q: {result.missingXid}. Narx topilmadi: {result.missingPrice}.
          </p>
          <p className="text-xs text-[#a1a1aa]">Narx turi: {result.priceType}. Narxlar tekshirilgan vaqt: {new Date(result.priceCheckedAt).toLocaleString("uz-UZ")}. Yakuniy importda miqdor va hujjat holati ham tekshiriladi.</p>
          {problems.length > 0 && (
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[#27272a]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#18181b] text-[#a1a1aa]"><tr>
                  <th scope="col" className="p-3">Mahsulot / SKU</th><th scope="col" className="p-3">XID</th><th scope="col" className="p-3">Kerakli amal</th>
                </tr></thead>
                <tbody>{problems.map((row) => <tr key={`${row.productId}:${row.skuId}`} className="border-t border-[#27272a]">
                  <td className="p-3 text-[#e4e4e7]"><button type="button" onClick={() => onFindProduct(row.productId || row.skuId)} className="text-left hover:underline focus-visible:outline focus-visible:outline-[#a78bfa]">{row.title}<span className="block mt-1 text-[#a1a1aa]">SKU {row.skuId}</span></button></td>
                  <td className="p-3 text-[#a1a1aa]">{row.xid || "—"}</td>
                  <td className="p-3 text-[#fbbf24]">{row.status === "MISSING_XID" ? "Mahsulotni ochib, SKU XID kiriting" : "Smartup’da shu XID va narx turini tekshiring"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          {!result.total && <p className="text-xs text-[#a1a1aa]">Do‘kon katalogida SKU topilmadi. Uzum ulanishini tekshiring.</p>}
        </div>
      )}
    </section>
  );
}
