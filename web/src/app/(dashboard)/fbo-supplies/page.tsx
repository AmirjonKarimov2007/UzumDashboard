"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Box, Boxes, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleDashed, Clock3, ExternalLink, Hash,
  Loader2, MapPin, PackageCheck, RefreshCw, Search, Send, ShieldCheck, X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import {
  FboInvoice, FboProduct, FboSku, SmartupImport, useCheckFboInvoiceInSmartup,
  useFboInvoiceProducts, useFboInvoices, useImportFboInvoiceToSmartup,
} from "@/hooks/use-fbo-invoices";

const PAGE_SIZE = 20;

type FboDeliveryState = "ACCEPTED" | "PARTIAL" | "PENDING" | "CANCELED";

const DELIVERY_FILTERS: Array<{ value: "ALL" | FboDeliveryState; label: string }> = [
  { value: "ALL", label: "Barcha holatlar" },
  { value: "ACCEPTED", label: "Topshirilgan" },
  { value: "PARTIAL", label: "Qisman topshirilgan" },
  { value: "PENDING", label: "Hali topshirilmagan" },
  { value: "CANCELED", label: "Bekor qilingan" },
];

function dateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uz-UZ", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function money(value?: number) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(Number(value))} so‘m`;
}

function deliveryState(invoice: FboInvoice): FboDeliveryState {
  const rawStatus = `${invoice.invoiceStatus?.value || ""} ${invoice.invoiceStatus?.text || ""}`.toUpperCase();
  const accepted = Number(invoice.totalAccepted || 0);
  const planned = Number(invoice.totalToStock || 0);

  if (/CANCEL|CANCELED|CANCELLED|BEKOR|ОТМЕН/.test(rawStatus)) return "CANCELED";
  if (accepted > 0 && planned > accepted) return "PARTIAL";
  if ((planned > 0 && accepted >= planned) || /ACCEPT|QABUL|TOPSHIR|ПРИНЯТ/.test(rawStatus)) return "ACCEPTED";
  return "PENDING";
}

function DeliveryBadge({ invoice, compact = false }: { invoice: FboInvoice; compact?: boolean }) {
  const state = deliveryState(invoice);
  const rawStatus = invoice.invoiceStatus?.text || invoice.invoiceStatus?.value;
  const config = {
    ACCEPTED: {
      label: "Topshirilgan",
      hint: "Uzum ombori to‘liq qabul qilgan",
      icon: CheckCircle2,
      className: "border-[#10b981]/25 bg-[#10b981]/10 text-[#34d399]",
    },
    PARTIAL: {
      label: "Qisman topshirilgan",
      hint: "Buyurtmaning bir qismi qabul qilingan",
      icon: AlertTriangle,
      className: "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]",
    },
    PENDING: {
      label: "Hali topshirilmagan",
      hint: "Buyurtma yaratilgan, ombor hali qabul qilmagan",
      icon: Clock3,
      className: "border-[#38bdf8]/25 bg-[#38bdf8]/10 text-[#7dd3fc]",
    },
    CANCELED: {
      label: "Bekor qilingan",
      hint: "Uzumda nakladnoy bekor qilingan",
      icon: X,
      className: "border-[#ef4444]/25 bg-[#ef4444]/10 text-[#f87171]",
    },
  }[state];
  const Icon = config.icon;

  return (
    <div className="inline-flex min-w-0 flex-col items-start gap-1" title={`${config.hint}${rawStatus ? ` · Uzum: ${rawStatus}` : ""}`}>
      <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold", config.className)}>
        <Icon className="h-3.5 w-3.5 shrink-0" />{config.label}
      </span>
      {!compact && <span className="max-w-[170px] text-[9px] leading-4 text-[#52525b]">{config.hint}</span>}
    </div>
  );
}

function SkuDeliveryBadge({ accepted, planned }: { accepted?: number; planned?: number }) {
  const acceptedQty = Number(accepted || 0);
  const plannedQty = Number(planned || 0);
  if (plannedQty > 0 && acceptedQty >= plannedQty) return <span className="inline-flex items-center gap-1 rounded-md bg-[#10b981]/10 px-2 py-1 text-[9px] font-semibold text-[#34d399]"><CheckCircle2 className="h-3 w-3" />Topshirilgan</span>;
  if (acceptedQty > 0) return <span className="inline-flex items-center gap-1 rounded-md bg-[#f59e0b]/10 px-2 py-1 text-[9px] font-semibold text-[#fbbf24]"><AlertTriangle className="h-3 w-3" />Qisman</span>;
  return <span className="inline-flex items-center gap-1 rounded-md bg-[#38bdf8]/10 px-2 py-1 text-[9px] font-semibold text-[#7dd3fc]"><Clock3 className="h-3 w-3" />Topshirilmagan</span>;
}

function isImported(value?: SmartupImport | null) {
  return value?.status === "SUCCESS" && !!value.smartupDealId;
}

function SmartupBadge({ value }: { value?: SmartupImport | null }) {
  if (isImported(value)) return (
    <div className="inline-flex min-w-0 flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[11px] font-semibold text-[#34d399]"><CheckCircle2 className="h-3.5 w-3.5" />Smartupda bor</span>
      <span className="max-w-[170px] truncate font-mono text-[9px] text-[#52525b]">Deal ID: {value?.smartupDealId}</span>
    </div>
  );
  if (value?.status === "REVIEW_REQUIRED" || value?.status === "PROCESSING") return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-2 py-1 text-[11px] font-semibold text-[#fbbf24]"><Clock3 className="h-3.5 w-3.5" />Tekshirish kerak</span>
  );
  if (value?.status === "ERROR" || value?.status === "NOT_FOUND") return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/10 px-2 py-1 text-[11px] font-semibold text-[#f87171]"><AlertTriangle className="h-3.5 w-3.5" />Smartupda yo‘q</span>
  );
  return <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#3f3f46] bg-[#18181b] px-2 py-1 text-[11px] font-medium text-[#a1a1aa]"><CircleDashed className="h-3.5 w-3.5" />Ko‘chirilmagan</span>;
}

export default function FboSuppliesPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | FboDeliveryState>("ALL");
  const [smartup, setSmartup] = useState<"ALL" | "IMPORTED" | "NOT_IMPORTED">("ALL");
  const [selected, setSelected] = useState<FboInvoice | null>(null);
  const invoicesQuery = useFboInvoices(page, PAGE_SIZE);
  const importMutation = useImportFboInvoiceToSmartup();
  const checkMutation = useCheckFboInvoiceInSmartup();
  const invoices = useMemo(() => invoicesQuery.data?.invoices || [], [invoicesQuery.data?.invoices]);

  const deliveryCounts = useMemo(() => invoices.reduce<Record<FboDeliveryState, number>>((counts, invoice) => {
    counts[deliveryState(invoice)] += 1;
    return counts;
  }, { ACCEPTED: 0, PARTIAL: 0, PENDING: 0, CANCELED: 0 }), [invoices]);
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const haystack = [invoice.id, invoice.invoiceNumber, invoice.externalNumber, invoice.stock?.title, invoice.stock?.address]
      .filter(Boolean).join(" ").toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesStatus = status === "ALL" || deliveryState(invoice) === status;
    const imported = isImported(invoice.smartupImport);
    const matchesSmartup = smartup === "ALL" || (smartup === "IMPORTED" ? imported : !imported);
    return matchesQuery && matchesStatus && matchesSmartup;
  }), [invoices, query, status, smartup]);

  const importInvoice = (invoice: FboInvoice) => {
    if (!window.confirm(`FBO nakladnoy #${invoice.invoiceNumber || invoice.id} Smartupga yuborilsinmi? Faqat ombor qabul qilgan miqdor yuboriladi. Barcha SKU tekshirilgandan keyingina hujjat yaratiladi.`)) return;
    importMutation.mutate(invoice.id);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="FBO ta’minlashlar"
        subtitle="Uzum omboriga berilgan nakladnoylar, SKU tarkibi va Smartup holati"
        action={<button onClick={() => invoicesQuery.refetch()} disabled={invoicesQuery.isFetching} className="flex h-9 items-center gap-2 rounded-xl border border-[#27272a] bg-[#0f0f16] px-3 text-xs font-medium text-[#a1a1aa] transition hover:border-[#38bdf8]/40 hover:text-white disabled:opacity-50"><RefreshCw className={cn("h-3.5 w-3.5", invoicesQuery.isFetching && "animate-spin")} /><span className="hidden sm:inline">Yangilash</span></button>}
      />

      <section className="overflow-hidden rounded-2xl border border-[#0ea5e9]/20 bg-[#0c1218]">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#38bdf8]/20 bg-[#0ea5e9]/10 text-[#38bdf8]"><PackageCheck className="h-5 w-5" /></div>
            <div><p className="text-sm font-semibold text-white">Faqat qabul qilingan mahsulotlar yuboriladi</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#71717a]">Smartupga rejalashtirilgan emas, ombor qabul qilgan miqdor yuboriladi. Bitta SKU’da XID, Smartup narxi yoki miqdor xatosi bo‘lsa, butun nakladnoy to‘xtaydi.</p></div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-[10px] sm:justify-end">
            <span className="rounded-lg border border-[#27272a] bg-[#0f0f16] px-2.5 py-1.5 text-[#a1a1aa]">Sahifa: <strong className="text-white">{invoices.length}</strong></span>
            <span className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-2.5 py-1.5 text-[#34d399]">Topshirilgan: <strong>{deliveryCounts.ACCEPTED}</strong></span>
            <span className="rounded-lg border border-[#38bdf8]/20 bg-[#38bdf8]/10 px-2.5 py-1.5 text-[#7dd3fc]">Kutilmoqda: <strong>{deliveryCounts.PENDING}</strong></span>
            <span className="rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/10 px-2.5 py-1.5 text-[#f87171]">Bekor: <strong>{deliveryCounts.CANCELED}</strong></span>
            <span className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-2.5 py-1.5 text-[#34d399]">Smartup: <strong>{invoices.filter((item) => isImported(item.smartupImport)).length}</strong></span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#1c1c24] bg-[#0f0f16] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525b]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nakladnoy ID, raqam yoki ombor bo‘yicha qidirish" className="h-10 w-full rounded-xl border border-[#27272a] bg-[#18181b] pl-9 pr-3 text-xs text-white outline-none placeholder:text-[#52525b] focus:border-[#38bdf8]/60" />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | FboDeliveryState)} className="h-10 min-w-[175px] rounded-xl border border-[#27272a] bg-[#18181b] px-3 text-xs text-[#d4d4d8] outline-none [color-scheme:dark] focus:border-[#38bdf8]/60">
              {DELIVERY_FILTERS.map((item) => <option value={item.value} key={item.value}>{item.label}{item.value === "ALL" ? "" : ` (${deliveryCounts[item.value]})`}</option>)}
            </select>
            {([[
              "ALL", "Hammasi"], ["IMPORTED", "Smartupda bor"], ["NOT_IMPORTED", "Ko‘chirilmagan"],
            ] as const).map(([value, label]) => <button key={value} onClick={() => setSmartup(value)} className={cn("h-10 whitespace-nowrap rounded-xl border px-3 text-xs font-medium transition", smartup === value ? "border-[#0ea5e9]/40 bg-[#0ea5e9]/15 text-[#7dd3fc]" : "border-[#27272a] bg-[#18181b] text-[#71717a] hover:text-white")}>{label}</button>)}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#1c1c24] bg-[#0f0f16]">
        <div className="hidden grid-cols-[115px_1fr_150px_115px_175px_220px] gap-4 border-b border-[#1c1c24] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[#52525b] xl:grid">
          <span>Nakladnoy</span><span>Ombor / sana</span><span>Status</span><span>Miqdor</span><span>Smartup</span><span className="text-right">Amallar</span>
        </div>
        {invoicesQuery.isLoading ? <LoadingState /> : invoicesQuery.isError ? <ErrorState message={(invoicesQuery.error as any)?.response?.data?.message || "FBO nakladnoylarni yuklab bo‘lmadi"} retry={() => invoicesQuery.refetch()} /> : !filtered.length ? <EmptyState filtered={!!query || status !== "ALL" || smartup !== "ALL"} /> : (
          <div className="divide-y divide-[#1c1c24]">
            {filtered.map((invoice) => (
              <article key={String(invoice.id)} className="group p-4 transition hover:bg-[#13131a] sm:p-5 xl:grid xl:grid-cols-[115px_1fr_150px_115px_175px_220px] xl:items-center xl:gap-4">
                <div><p className="font-mono text-sm font-semibold text-white">#{invoice.invoiceNumber || invoice.id}</p><p className="mt-1 font-mono text-[10px] text-[#52525b]">ID {invoice.id}</p></div>
                <div className="mt-3 min-w-0 xl:mt-0"><p className="flex items-center gap-1.5 truncate text-xs font-medium text-[#d4d4d8]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#38bdf8]" />{invoice.stock?.title || "Ombor ko‘rsatilmagan"}</p><p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#71717a]"><CalendarDays className="h-3 w-3" />{dateTime(invoice.dateCreated)}</p></div>
                <div className="mt-3 xl:mt-0"><DeliveryBadge invoice={invoice} /></div>
                <div className="mt-3 flex items-center gap-5 xl:mt-0 xl:block"><div><p className="text-[9px] uppercase tracking-wider text-[#52525b] xl:hidden">Qabul / jami</p><p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{invoice.totalAccepted || 0} / {invoice.totalToStock || 0}</p></div><p className="text-[10px] text-[#71717a] xl:mt-1">{money(invoice.fullPrice)}</p></div>
                <div className="mt-3 xl:mt-0"><SmartupBadge value={invoice.smartupImport} /></div>
                <div className="mt-4 flex flex-wrap gap-2 xl:mt-0 xl:justify-end">
                  {invoice.smartupImport && <button onClick={() => checkMutation.mutate(invoice.id)} disabled={checkMutation.isPending} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#3f3f46] px-3 text-[11px] font-medium text-[#a1a1aa] transition hover:border-[#38bdf8]/40 hover:text-white disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />Tekshirish</button>}
                  {!isImported(invoice.smartupImport) && <button onClick={() => importInvoice(invoice)} disabled={importMutation.isPending} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#10b981]/25 bg-[#10b981]/10 px-3 text-[11px] font-semibold text-[#34d399] transition hover:bg-[#10b981]/20 disabled:opacity-50">{importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Ko‘chirish</button>}
                  <button onClick={() => setSelected(invoice)} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#27272a] px-3 text-[11px] font-semibold text-white transition hover:bg-[#3f3f46]">Tarkibi<ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#52525b]">{page + 1}-sahifa · {filtered.length} ta ko‘rsatilmoqda</p>
        <div className="flex gap-2"><button disabled={page === 0 || invoicesQuery.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#27272a] px-3 text-xs text-[#a1a1aa] disabled:opacity-35"><ArrowLeft className="h-3.5 w-3.5" />Oldingi</button><button disabled={!invoicesQuery.data?.hasNext || invoicesQuery.isFetching} onClick={() => setPage((value) => value + 1)} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#27272a] px-3 text-xs text-[#a1a1aa] disabled:opacity-35">Keyingi<ArrowRight className="h-3.5 w-3.5" /></button></div>
      </div>

      {selected && <InvoiceDetail invoice={selected} close={() => setSelected(null)} importInvoice={importInvoice} importPending={importMutation.isPending} check={() => checkMutation.mutate(selected.id)} checkPending={checkMutation.isPending} />}
    </div>
  );
}

function LoadingState() { return <div className="flex min-h-72 flex-col items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-[#38bdf8]" /><p className="text-xs text-[#71717a]">FBO nakladnoylar olinmoqda…</p></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertTriangle className="h-8 w-8 text-[#f87171]" /><p className="mt-3 text-sm font-medium text-white">Ma’lumotlarni olib bo‘lmadi</p><p className="mt-1 max-w-lg text-xs leading-5 text-[#71717a]">{message}</p><button onClick={retry} className="mt-4 rounded-xl border border-[#3f3f46] px-3 py-2 text-xs text-white">Qayta urinish</button></div>; }
function EmptyState({ filtered }: { filtered: boolean }) { return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><Boxes className="h-9 w-9 text-[#3f3f46]" /><p className="mt-3 text-sm font-medium text-[#d4d4d8]">{filtered ? "Filter bo‘yicha nakladnoy topilmadi" : "FBO nakladnoylar topilmadi"}</p><p className="mt-1 text-xs text-[#52525b]">{filtered ? "Filterlarni tozalab qayta ko‘ring." : "Uzum Seller’da yaratilgan FBO ta’minlashlar shu yerda chiqadi."}</p></div>; }

function flattenProducts(products: FboProduct[]) {
  return products.flatMap((product) => product.skuForInvoiceDtoList?.length
    ? product.skuForInvoiceDtoList.map((sku) => ({ product, sku }))
    : [{ product, sku: product as FboSku }]);
}

function InvoiceDetail({ invoice, close, importInvoice, importPending, check, checkPending }: { invoice: FboInvoice; close: () => void; importInvoice: (invoice: FboInvoice) => void; importPending: boolean; check: () => void; checkPending: boolean }) {
  const detail = useFboInvoiceProducts(invoice.id);
  const rows = flattenProducts(detail.data?.products || []);
  const currentImport = detail.data?.smartupImport ?? invoice.smartupImport;
  const acceptedQty = rows.reduce((sum, row) => sum + Number(row.sku.quantityAccepted || 0), 0);
  const plannedQty = rows.reduce((sum, row) => sum + Number(row.sku.quantityToStock || 0), 0);

  return <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <aside role="dialog" aria-modal="true" aria-label="FBO nakladnoy tarkibi" className="flex h-full w-full max-w-3xl flex-col border-l border-[#27272a] bg-[#0a0a0f] shadow-2xl shadow-black">
      <header className="border-b border-[#1c1c24] p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#38bdf8]">FBO nakladnoy tarkibi</p><h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">#{invoice.invoiceNumber || invoice.id}</h2><p className="mt-1 font-mono text-[10px] text-[#52525b]">Uzum invoice ID: {invoice.id}</p><div className="mt-3"><DeliveryBadge invoice={invoice} compact /></div></div><button onClick={close} aria-label="Yopish" className="rounded-xl border border-[#27272a] p-2 text-[#71717a] hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat icon={MapPin} label="Ombor" value={invoice.stock?.title || "—"} />
          <MiniStat icon={CalendarDays} label="Yaratildi" value={dateTime(invoice.dateCreated)} />
          <MiniStat icon={Box} label="Qabul / reja" value={`${acceptedQty} / ${plannedQty} dona`} />
          <MiniStat icon={Hash} label="Jami qiymat" value={money(invoice.fullPrice)} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#27272a] bg-[#0f0f16] p-4 sm:flex-row sm:items-center sm:justify-between"><SmartupBadge value={currentImport} /><div className="flex gap-2">{currentImport && <button onClick={check} disabled={checkPending} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#3f3f46] px-3 text-xs text-[#a1a1aa] disabled:opacity-50">{checkPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}Tekshirish</button>}{!isImported(currentImport) && <button onClick={() => importInvoice(invoice)} disabled={importPending || detail.isLoading} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#10b981] px-3 text-xs font-semibold text-white disabled:opacity-50">{importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Smartupga ko‘chirish</button>}</div></div>

        {currentImport?.errorMessage && <div className="mb-4 flex gap-2 rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 p-3 text-xs leading-5 text-[#fbbf24]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{currentImport.errorMessage}</div>}

        {detail.isLoading ? <LoadingState /> : detail.isError ? <ErrorState message={(detail.error as any)?.response?.data?.message || "Nakladnoy tarkibini yuklab bo‘lmadi"} retry={() => detail.refetch()} /> : !rows.length ? <EmptyState filtered={false} /> : <div className="overflow-hidden rounded-2xl border border-[#1c1c24] bg-[#0f0f16]">
          <div className="hidden grid-cols-[1fr_120px_115px_105px] gap-3 border-b border-[#1c1c24] px-4 py-3 text-[9px] font-semibold uppercase tracking-wider text-[#52525b] sm:grid"><span>Mahsulot / SKU</span><span>XID</span><span>Qabul holati</span><span className="text-right">Kirim narxi</span></div>
          <div className="divide-y divide-[#1c1c24]">{rows.map(({ product, sku }, index) => {
            const xid = sku.xid || product.xid;
            return <div key={`${sku.id}-${index}`} className="p-4 sm:grid sm:grid-cols-[1fr_120px_115px_105px] sm:items-center sm:gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-white" title={product.productTitle || product.skuTitle}>{product.productTitle || product.skuTitle || "Nomsiz mahsulot"}</p><p className="mt-1 truncate text-[10px] text-[#71717a]">{sku.skuTitle || "Variant ko‘rsatilmagan"} · SKU {sku.id}</p></div><div className="mt-2 sm:mt-0">{xid ? <span className="inline-flex items-center gap-1 rounded-md bg-[#10b981]/10 px-2 py-1 font-mono text-[10px] text-[#34d399]"><Check className="h-3 w-3" />{xid}</span> : <span className="inline-flex items-center gap-1 rounded-md bg-[#ef4444]/10 px-2 py-1 text-[10px] text-[#f87171]"><X className="h-3 w-3" />XID yo‘q</span>}</div><div className="mt-2 flex flex-col items-start gap-1 sm:mt-0"><SkuDeliveryBadge accepted={sku.quantityAccepted} planned={sku.quantityToStock} /><span className="text-[10px] font-semibold tabular-nums text-[#a1a1aa]">{sku.quantityAccepted || 0} / {sku.quantityToStock || 0} dona</span></div><p className="mt-2 text-xs text-[#a1a1aa] sm:mt-0 sm:text-right">{money(sku.purchasePrice ?? product.purchasePrice)}</p></div>;
          })}</div>
        </div>}
      </div>
    </aside>
  </div>;
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof ExternalLink; label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-[#1c1c24] bg-[#0f0f16] p-3"><p className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[#52525b]"><Icon className="h-3 w-3" />{label}</p><p className="mt-1 truncate text-xs font-medium text-[#d4d4d8]" title={value}>{value}</p></div>; }
