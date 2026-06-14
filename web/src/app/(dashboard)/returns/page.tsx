"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  RotateCcw, RefreshCw, AlertTriangle, Package, Boxes, DollarSign,
  Percent, TrendingDown, Search, Loader2, Clock, X,
  FileSpreadsheet, Calendar, FileText, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import {
  useReturnsAnalytics, useReturnInvoices, useReturnInvoiceDetail,
  type ReturnRow, type ReturnStatus, type ReturnsFilters, type ReturnInvoice,
} from "@/hooks/use-returns";
import { useDashboardStore } from "@/stores/dashboard-store";
import { formatMoney, usdToUzs } from "@/lib/currency";

const DAY = 86_400_000;
function dayStart(ms: number) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayEnd(ms: number) { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); }
function fmtDate(ms: number | null) {
  if (!ms) return "—";
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function toInputDate(ms: number) {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Returns ro'yxatini .xlsx qilib yuklab beradi (ikkala ID + barcha ustunlar). */
async function exportReturnsXlsx(rows: any[], usdToSom: (usd: number) => number, label: string) {
  if (!rows.length) { toast.error("Eksport uchun ma'lumot yo'q"); return; }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Uzum Dashboard";
  wb.created = new Date();
  const statusLabel: Record<string, string> = {
    RETURNED: "Qaytarilgan", READY_FOR_PICKUP: "Olishga tayyor", RECEIVED: "Qabul qilindi", LOST: "Yo'qolgan",
  };
  const ws = wb.addWorksheet("Qaytarishlar", { properties: { defaultRowHeight: 18 } });
  ws.columns = [
    { header: "Return ID", key: "publicId", width: 18 },
    { header: "Order ID", key: "orderId", width: 16 },
    { header: "Mahsulot", key: "product", width: 50 },
    { header: "SKU", key: "sku", width: 24 },
    { header: "Barcode", key: "barcode", width: 18 },
    { header: "Buyurtma sana", key: "ordered", width: 14 },
    { header: "Qaytgan sana", key: "returned", width: 14 },
    { header: "Soni", key: "qty", width: 8, style: { numFmt: "#,##0" } },
    { header: "Tan narx (so'm)", key: "cost", width: 16, style: { numFmt: "#,##0" } },
    { header: "Sotuv (so'm)", key: "sale", width: 16, style: { numFmt: "#,##0" } },
    { header: "Sabab", key: "reason", width: 24 },
    { header: "Status", key: "status", width: 16 },
    { header: "Kutyapti (kun)", key: "days", width: 14, style: { numFmt: "#,##0" } },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } };
  const d = (ms: number | null) => (ms ? toInputDate(ms) : "—");
  for (const r of rows) {
    ws.addRow({
      publicId: r.publicId || "—",
      orderId: r.uzumOrderId,
      product: r.productName,
      sku: r.skuTitle || "—",
      barcode: r.barcode || "—",
      ordered: d(r.orderedAt),
      returned: d(r.returnedAt),
      qty: r.quantity,
      cost: r.costUsd != null ? Math.round(usdToSom(r.costUsd) * (r.quantity || 1)) : 0,
      sale: r.salePrice != null ? r.salePrice * (r.quantity || 1) : 0,
      reason: r.reason || "—",
      status: statusLabel[r.status] || r.status,
      days: r.daysWaiting ?? 0,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `qaytarishlar-${label}-${toInputDate(Date.now())}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast.success("Excel yuklab olindi");
}

const STATUS_CFG: Record<ReturnStatus, { label: string; color: string; bg: string; hint: string }> = {
  RETURNED: { label: "Qaytarilgan", color: "#f59e0b", bg: "rgba(245,158,11,.15)", hint: "Uzum omborida kutyapti" },
  READY_FOR_PICKUP: { label: "Olishga tayyor", color: "#06b6d4", bg: "rgba(6,182,212,.15)", hint: "Olib ketishga tayyor" },
  RECEIVED: { label: "Qabul qilindi", color: "#10b981", bg: "rgba(16,185,129,.15)", hint: "Sotuvchi qabul qildi" },
  LOST: { label: "Yo'qolgan", color: "#ef4444", bg: "rgba(239,68,68,.15)", hint: "15+ kun qabul qilinmagan" },
};

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Barcha statuslar" },
  { id: "RETURNED", label: "Qaytarilgan" },
  { id: "READY_FOR_PICKUP", label: "Olishga tayyor" },
  { id: "RECEIVED", label: "Qabul qilindi" },
  { id: "LOST", label: "Yo'qolgan" },
];

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: "all", label: "Hammasi", days: null },
  { id: "month", label: "Oy", days: 30 },
  { id: "quarter", label: "3 oy", days: 90 },
  { id: "year", label: "Yil", days: 365 },
];

export default function ReturnsPage() {
  const { usdRate, displayCurrency } = useDashboardStore();
  const fmtMoney = (som: number) => formatMoney(som, displayCurrency, usdRate);
  const fmtCostUsd = (usd: number) => fmtMoney(usdToUzs(usd, usdRate));

  const [tab, setTab] = useState<"all" | "lost" | "invoices">("all");
  const [openInvoiceId, setOpenInvoiceId] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState("all");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [sku, setSku] = useState("");

  const filters: ReturnsFilters = useMemo(() => {
    const f: ReturnsFilters = {};
    if (custom) { f.dateFrom = custom.from; f.dateTo = custom.to; }
    else { const r = RANGES.find((x) => x.id === rangeId); if (r?.days) { f.dateFrom = dayStart(Date.now() - (r.days - 1) * DAY); f.dateTo = Date.now(); } }
    if (status) f.status = status;
    if (product.trim()) f.product = product.trim();
    if (sku.trim()) f.sku = sku.trim();
    return f;
  }, [rangeId, custom, status, product, sku]);

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const a = dayStart(new Date(draftFrom).getTime());
    const b = dayEnd(new Date(draftTo).getTime());
    setCustom({ from: Math.min(a, b), to: Math.max(a, b) });
  };

  const { data, isLoading, isFetching, refresh } = useReturnsAnalytics(filters);
  const invoicesQuery = useReturnInvoices(tab === "invoices");
  const invoiceDetail = useReturnInvoiceDetail(openInvoiceId);

  const a = data?.analytics;
  const rows = tab === "lost" ? (data?.lostReport ?? []) : (data?.returns ?? []);

  const kpis = [
    { label: "Jami qaytarish", value: a ? `${a.totalItems} ta` : "—", sub: `${a?.totalQty ?? 0} dona`, icon: RotateCcw, color: "#8b5cf6" },
    { label: "Qaytgan tovar qiymati", value: a ? fmtMoney(a.totalSaleValue) : "—", sub: "sotuv narxida", icon: DollarSign, color: "#3b82f6" },
    { label: "Qaytarish foizi", value: a?.returnRate != null ? `${a.returnRate.toFixed(1)}%` : "—", sub: a ? `${a.soldQty} sotilgan` : "", icon: Percent, color: "#06b6d4" },
    { label: "Yo'qolgan", value: a ? `${a.lostItems} ta` : "—", sub: `${a?.lostQty ?? 0} dona`, icon: AlertTriangle, color: "#ef4444" },
    { label: "Yo'qolgan qiymat", value: a ? fmtCostUsd(a.lostCostUsd) : "—", sub: "tan narxda", icon: TrendingDown, color: "#f97316" },
    { label: "Statuslar", value: a ? `${a.byStatus.RECEIVED ?? 0} qabul` : "—", sub: a ? `${a.byStatus.RETURNED ?? 0} kutyapti` : "", icon: Boxes, color: "#10b981" },
  ];

  const maxMonthQty = Math.max(1, ...(a?.byMonth ?? []).map((m) => m.qty));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Qaytarishlar tahlili"
        subtitle="Biznes boshidan beri barcha qaytarishlar — yo'qolganlarni aniqlash"
        action={
          <button
            onClick={() => refresh()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#a1a1aa] hover:text-white transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            <span className="hidden md:inline">Yangilash</span>
          </button>
        }
      />

      {/* Lost warning */}
      {!!a?.lostItems && (
        <div className="rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#ef4444] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#ef4444]">{a.lostItems} ta qaytarish yo'qolgan bo'lishi mumkin</p>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              15+ kun oldin qaytarilgan, lekin hali qabul qilinmagan. Jami tan narxda{" "}
              <span className="font-semibold text-white">{fmtCostUsd(a.lostCostUsd)}</span>. Tekshiring va topshirilganini belgilang.
            </p>
          </div>
          <button onClick={() => setTab("lost")} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#ef4444]/15 hover:bg-[#ef4444]/25 text-[#ef4444] text-xs font-semibold transition-colors">
            Ko'rish
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.2) }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${k.color}18`, border: `1px solid ${k.color}30` }}>
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
            </div>
            <p className="text-[11px] text-[#52525b]">{k.label}</p>
            {isLoading ? <div className="h-6 w-16 rounded bg-[#18181b] animate-pulse mt-1" /> : (
              <p className="text-base sm:text-lg font-bold text-white truncate" title={String(k.value)}>{k.value}</p>
            )}
            <p className="text-[10px] text-[#52525b] mt-0.5 truncate">{k.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* By-month chart + Most returned */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Oylar bo'yicha qaytarishlar</h2>
          {a?.byMonth?.length ? (
            <div className="flex items-end gap-2 h-40">
              {a.byMonth.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex flex-col justify-end items-center h-32 relative">
                    <div className="w-full max-w-[36px] rounded-t-md bg-[#8b5cf6]/70 relative" style={{ height: `${(m.qty / maxMonthQty) * 100}%` }}>
                      {m.lost > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 rounded-t-md bg-[#ef4444]" style={{ height: `${(m.lost / m.qty) * 100}%` }} title={`${m.lost} yo'qolgan`} />
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] text-[#52525b] tabular-nums">{m.qty}</span>
                  <span className="text-[9px] text-[#52525b] -rotate-45 origin-center whitespace-nowrap">{m.month.slice(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-[#52525b]">Ma'lumot yo'q</div>
          )}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-[#71717a]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6]/70" /> Qaytgan</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Yo'qolgan</span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Eng ko'p qaytarilgan</h2>
          <div className="space-y-2.5">
            {(a?.mostReturned ?? []).slice(0, 6).map((p, i) => (
              <div key={p.sku + i} className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-[#3f3f46] w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate" title={p.name}>{p.name}</p>
                  {p.sku && <p className="text-[10px] text-[#52525b] font-mono truncate">{p.sku}</p>}
                </div>
                <span className="text-xs font-bold text-[#8b5cf6] tabular-nums flex-shrink-0">{p.qty} ta</span>
              </div>
            ))}
            {!a?.mostReturned?.length && <p className="text-xs text-[#52525b] text-center py-6">Ma'lumot yo'q</p>}
          </div>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#18181b] border border-[#27272a] w-full sm:w-fit overflow-x-auto scrollbar-none">
          {([
            ["all", "Barcha qaytarishlar"],
            ["lost", "Yo'qolgan mahsulotlar"],
            ["invoices", "Qaytarilganlar ro'yxati"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-all",
                tab === id ? (id === "lost" ? "bg-[#ef4444] text-white" : id === "invoices" ? "bg-[#06b6d4] text-white" : "bg-[#27272a] text-white") : "text-[#71717a] hover:text-white")}>
              {label}{id === "lost" && a?.lostItems ? ` (${a.lostItems})` : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f0f16] border border-[#1c1c24] overflow-x-auto scrollbar-none">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => { setRangeId(r.id); setCustom(null); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all",
                  !custom && rangeId === r.id ? "bg-[#8b5cf6] text-white" : "text-[#71717a] hover:text-white")}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Davrdan–davrgacha (custom) */}
          <div className="flex items-center gap-1.5 px-2 h-9 rounded-xl bg-[#0f0f16] border border-[#1c1c24]">
            <Calendar className="w-3.5 h-3.5 text-[#52525b]" />
            <input type="date" value={draftFrom} max={toInputDate(Date.now())} onChange={(e) => setDraftFrom(e.target.value)}
              className="bg-transparent text-[11px] text-white focus:outline-none [color-scheme:dark] w-[110px]" />
            <span className="text-[#52525b] text-xs">–</span>
            <input type="date" value={draftTo} max={toInputDate(Date.now())} onChange={(e) => setDraftTo(e.target.value)}
              className="bg-transparent text-[11px] text-white focus:outline-none [color-scheme:dark] w-[110px]" />
            <button onClick={applyCustom} disabled={!draftFrom || !draftTo}
              className="px-2 py-1 rounded-md bg-[#8b5cf6] text-white text-[10px] font-semibold disabled:opacity-40">OK</button>
            {custom && (
              <button onClick={() => { setCustom(null); setDraftFrom(""); setDraftTo(""); }} className="text-[#52525b] hover:text-[#ef4444]" title="Tozalash">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-9 px-3 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] [color-scheme:dark]">
            {STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Mahsulot nomi"
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-white focus:outline-none focus:border-[#8b5cf6] placeholder:text-[#52525b]" />
          </div>
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU / barcode"
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-white font-mono focus:outline-none focus:border-[#8b5cf6] placeholder:text-[#52525b]" />
          </div>

          {/* Excel eksport */}
          <button
            onClick={() => exportReturnsXlsx(rows, (usd) => usdToUzs(usd, usdRate), tab === "lost" ? "yoqolgan" : "barchasi")}
            className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#34d399] hover:to-[#10b981] text-white text-xs font-semibold transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Table */}
      {tab !== "invoices" && (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
          <div className="hidden lg:grid grid-cols-[120px_1fr_120px_92px_92px_60px_100px_100px_130px] gap-3 px-4 py-3 border-b border-[#18181b] text-[10px] font-semibold text-[#52525b] uppercase tracking-wider">
            <span>Return / Order ID</span><span>Mahsulot</span><span>SKU</span><span>Buyurtma</span><span>Qaytgan</span><span>Soni</span><span>Tan narx</span><span>Sotuv</span><span>Status</span>
          </div>
          {isLoading ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#52525b]">
              {tab === "lost" ? "Yo'qolgan qaytarish yo'q 🎉" : "Qaytarishlar topilmadi"}
            </div>
          ) : (
            <div className="divide-y divide-[#18181b]">
              {rows.map((r) => (
                <ReturnLine key={r.id} r={r} fmtMoney={fmtMoney} fmtCostUsd={fmtCostUsd} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Qaytarilganlar ro'yxati (Uzum nakladnoylari) */}
      {tab === "invoices" && (
        <InvoicesPanel
          isLoading={invoicesQuery.isLoading}
          invoices={invoicesQuery.data?.invoices ?? []}
          onOpen={setOpenInvoiceId}
        />
      )}

      {/* Detail modal */}
      {openInvoiceId != null && (
        <InvoiceDetailModal
          returnId={openInvoiceId}
          loading={invoiceDetail.isLoading}
          invoice={invoiceDetail.data?.invoice ?? null}
          onClose={() => setOpenInvoiceId(null)}
        />
      )}
    </div>
  );
}

// ─── Qaytarilganlar ro'yxati (nakladnoylar) ──────────────────────────────

const INV_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: "Yakunlangan", color: "#10b981", bg: "rgba(16,185,129,.15)" },
  ASSEMBLED: { label: "Yig'ilgan", color: "#06b6d4", bg: "rgba(6,182,212,.15)" },
  RESERVED: { label: "Rezerv qilindi", color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
  CANCELED: { label: "Bekor qilindi", color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  PENDING: { label: "Kutilmoqda", color: "#a78bfa", bg: "rgba(167,139,250,.15)" },
};

function invStatus(s: string) {
  return INV_STATUS_CFG[s] || { label: s || "—", color: "#a1a1aa", bg: "rgba(161,161,170,.15)" };
}

function InvoicesPanel({ isLoading, invoices, onOpen }: {
  isLoading: boolean; invoices: ReturnInvoice[]; onOpen: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
      <div className="hidden lg:grid grid-cols-[140px_1fr_120px_130px_130px_100px_70px] gap-3 px-4 py-3 border-b border-[#18181b] text-[10px] font-semibold text-[#52525b] uppercase tracking-wider">
        <span>Return ID</span><span>Ombor</span><span>Tur</span><span>Yaratildi</span><span>Yakunlandi</span><span>Status</span><span className="text-right">Soni</span>
      </div>
      {isLoading ? (
        <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#06b6d4] animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="py-16 text-center text-sm text-[#52525b]">Nakladnoylar topilmadi</div>
      ) : (
        <div className="divide-y divide-[#18181b]">
          {invoices.map((inv) => {
            const st = invStatus(inv.status);
            return (
              <button key={inv.id} onClick={() => onOpen(inv.id)}
                className="w-full text-left px-4 py-3 hover:bg-[#13131a] transition-colors">
                {/* Desktop */}
                <div className="hidden lg:grid grid-cols-[140px_1fr_120px_130px_130px_100px_70px] gap-3 items-center">
                  <span className="text-xs font-mono text-white">{inv.id}</span>
                  <span className="text-xs text-white truncate" title={inv.stock?.title || "—"}>
                    {inv.stock?.title || "—"}
                  </span>
                  <span className="text-[11px] font-mono text-[#71717a]">{inv.type || "—"}</span>
                  <span className="text-[11px] text-[#a1a1aa]">{fmtDate(inv.dateCreated)}</span>
                  <span className="text-[11px] text-[#a1a1aa]">{fmtDate(inv.completedDate ?? null)}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold w-fit" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  <span className="text-xs font-semibold text-white tabular-nums text-right flex items-center justify-end gap-1">
                    {inv.totalPackedAmount ?? inv.totalAmount ?? 0}
                    <ChevronRight className="w-3.5 h-3.5 text-[#52525b]" />
                  </span>
                </div>
                {/* Mobile */}
                <div className="lg:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-white">#{inv.id}</p>
                      <p className="text-[11px] text-[#a1a1aa] truncate">{inv.stock?.title || "—"}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[#71717a] flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(inv.dateCreated)}</span>
                    {inv.type && <span className="font-mono">{inv.type}</span>}
                    <span>{inv.totalPackedAmount ?? inv.totalAmount ?? 0} dona</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InvoiceDetailModal({ returnId, loading, invoice, onClose }: {
  returnId: number; loading: boolean; invoice: ReturnInvoice | null; onClose: () => void;
}) {
  const st = invStatus(invoice?.status || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-[#0f0f16] border border-[#1c1c24] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-[#18181b]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-[#06b6d4]" />
              <h3 className="text-base font-semibold text-white">Qaytarish nakladnoyi #{returnId}</h3>
              {invoice && (
                <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              )}
            </div>
            {invoice?.stock?.title && (
              <p className="text-xs text-[#a1a1aa] mt-1 truncate">{invoice.stock.title}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#71717a] hover:text-white hover:bg-[#18181b] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta */}
        {invoice && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 border-b border-[#18181b]">
            <div>
              <p className="text-[10px] uppercase text-[#52525b] tracking-wider">Yaratildi</p>
              <p className="text-xs text-white mt-1">{fmtDate(invoice.dateCreated)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#52525b] tracking-wider">Yakunlandi</p>
              <p className="text-xs text-white mt-1">{fmtDate(invoice.completedDate ?? null)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#52525b] tracking-wider">Tur</p>
              <p className="text-xs font-mono text-white mt-1">{invoice.type || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[#52525b] tracking-wider">Jami / Yig'ilgan</p>
              <p className="text-xs font-semibold text-white tabular-nums mt-1">
                {invoice.totalAmount ?? 0} / {invoice.totalPackedAmount ?? 0}
              </p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#06b6d4] animate-spin" /></div>
          ) : !invoice?.returnItems?.length ? (
            <div className="py-16 text-center text-sm text-[#52525b]">Mahsulotlar topilmadi</div>
          ) : (
            <div className="divide-y divide-[#18181b]">
              {invoice.returnItems.map((it, i) => (
                <div key={it.id} className="px-4 sm:px-5 py-3 hover:bg-[#13131a] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0">
                      <Package className="w-3.5 h-3.5 text-[#71717a]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white" title={it.productTitle || ""}>
                        <span className="text-[10px] font-bold text-[#52525b] mr-2">#{i + 1}</span>
                        {it.productTitle || "—"}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[11px] font-mono text-[#71717a]">{it.skuTitle || "—"}</span>
                        <span className="text-[11px] text-[#52525b]">SKU ID: <span className="font-mono">{it.skuId}</span></span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white tabular-nums">{it.packedAmount} / {it.amount} dona</p>
                      {it.purchasePrice != null && (
                        <p className="text-[11px] text-[#10b981] tabular-nums">{it.purchasePrice.toLocaleString("ru-RU")} so'm</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReturnLine({ r, fmtMoney, fmtCostUsd }: {
  r: ReturnRow; fmtMoney: (n: number) => string; fmtCostUsd: (n: number) => string;
}) {
  const st = STATUS_CFG[r.status];
  const isLost = r.status === "LOST";

  return (
    <div className={cn("px-4 py-3 hover:bg-[#13131a] transition-colors", isLost && "bg-[#ef4444]/[0.04]")}>
      {/* Desktop grid */}
      <div className="hidden lg:grid grid-cols-[120px_1fr_120px_92px_92px_60px_100px_100px_130px] gap-3 items-center">
        <div className="min-w-0">
          <p className="text-xs font-mono text-white truncate" title={r.publicId || r.returnId}>{r.publicId || "—"}</p>
          <p className="text-[10px] font-mono text-[#52525b] truncate" title={r.uzumOrderId}>{r.uzumOrderId}</p>
        </div>
        <span className="text-xs text-white truncate" title={r.productName}>{r.productName}</span>
        <span className="text-[11px] font-mono text-[#71717a] truncate">{r.skuTitle || r.barcode || "—"}</span>
        <span className="text-[11px] text-[#71717a]">{fmtDate(r.orderedAt)}</span>
        <span className="text-[11px] text-[#a1a1aa]">{fmtDate(r.returnedAt)}</span>
        <span className="text-xs font-semibold text-white tabular-nums">{r.quantity}</span>
        <span className="text-[11px] text-[#10b981] tabular-nums">{r.costUsd != null ? fmtCostUsd(r.costUsd) : "—"}</span>
        <span className="text-[11px] text-white tabular-nums">{r.salePrice != null ? fmtMoney(r.salePrice) : "—"}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
        </div>
      </div>

      {/* Mobile card */}
      <div className="lg:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{r.productName}</p>
            <p className="text-[11px] font-mono text-[#71717a] truncate">{r.skuTitle || r.barcode || "—"}</p>
            <p className="text-[10px] font-mono text-[#52525b] truncate">ID: {r.publicId || "—"} · {r.uzumOrderId}</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0" style={{ color: st.color, background: st.bg }}>{st.label}</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-[#71717a] flex-wrap">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDate(r.returnedAt)}</span>
          <span>{r.quantity} dona</span>
          {r.salePrice != null && <span className="text-white">{fmtMoney(r.salePrice)}</span>}
          {r.costUsd != null && <span className="text-[#10b981]">tan: {fmtCostUsd(r.costUsd)}</span>}
          {isLost && r.daysWaiting != null && <span className="text-[#ef4444]">{r.daysWaiting} kun</span>}
        </div>
        {r.reason && <p className="text-[11px] text-[#52525b] mt-1">Sabab: {r.reason}</p>}
      </div>
    </div>
  );
}
