"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Boxes, AlertTriangle, Package, RefreshCw, Search, Loader2,
  Download, Plus, Minus, Save, X, TrendingUp, Link2Off,
  ArrowDownUp, Tag, ShoppingCart, ListChecks, ChevronLeft, ChevronRight,
  ZoomIn, RotateCcw, ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useFbsStocks, useSetFbsStocks, type FbsStockItem } from "@/hooks/use-stocks";

/** To'liq summa, minglik ajratgich bilan: "1 243 275 so'm" (qisqartmasdan). */
function fmtSom(n?: number | null): string {
  return `${new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0))} so'm`;
}
function fmtNum(n?: number | null): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));
}

/** Yuqori sifatli rasm (lightbox uchun): 540 -> original. */
function hiResImage(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/t_product_[^/]+\.jpg$/i, "/original.jpg");
}

type FilterId = "all" | "in_stock" | "out_of_stock" | "unlinked";
type SortId = "newest" | "amount_desc" | "amount_asc" | "name" | "sold_desc" | "value_desc";

/** Mahsulot kaliti (bir tovarning bir nechta SKU si bo'lishi mumkin). */
function productKey(s: FbsStockItem): string {
  return s.productId != null ? `p${s.productId}` : `t:${s.productTitle || s.skuId}`;
}

export default function InventoryPage() {
  const { data, isLoading, isError, isFetching, refresh } = useFbsStocks();
  const setStocks = useSetFbsStocks();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("newest");
  // skuId → yangi qiymat (faqat o'zgartirilganlar)
  const [edits, setEdits] = useState<Record<number, number>>({});
  // Lightbox: filtered ro'yxatdagi indeks (yoki null)
  const [lightbox, setLightbox] = useState<number | null>(null);
  // "O'zgartirilganlarni ko'rish" oynasi
  const [showChanges, setShowChanges] = useState(false);

  const stocks = data?.stocks ?? [];

  // ── Tovar (mahsulot) bo'yicha hisob — SKU bo'yicha emas ──────────────
  const productCounts = useMemo(() => {
    const groups = new Map<string, { units: number; unlinked: boolean }>();
    for (const s of stocks) {
      const k = productKey(s);
      const g = groups.get(k) || { units: 0, unlinked: false };
      g.units += s.amount || 0;
      if (!s.fbsLinked) g.unlinked = true;
      groups.set(k, g);
    }
    let all = 0, inStock = 0, outOfStock = 0, unlinked = 0;
    for (const g of groups.values()) {
      all++;
      if (g.units > 0) inStock++; else outOfStock++;
      if (g.unlinked) unlinked++;
    }
    return { all, in_stock: inStock, out_of_stock: outOfStock, unlinked };
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = stocks.filter((s) => {
      if (filter === "in_stock" && !(s.amount > 0)) return false;
      if (filter === "out_of_stock" && s.amount !== 0) return false;
      if (filter === "unlinked" && s.fbsLinked) return false;
      if (!q) return true;
      return (
        s.productTitle?.toLowerCase().includes(q) ||
        s.skuTitle?.toLowerCase().includes(q) ||
        String(s.barcode).includes(q) ||
        String(s.article).toLowerCase().includes(q)
      );
    });
    // MUHIM: saralash faqat ASL qiymatlar bo'yicha — tahrir paytida
    // qatorlar joyidan siljimasligi uchun edits ishlatilmaydi.
    const val = (s: FbsStockItem) => s.amount * (s.price || 0);
    return [...list].sort((a, b) => {
      switch (sort) {
        case "newest": return (b.productId ?? -1) - (a.productId ?? -1) || a.skuId - b.skuId;
        case "amount_asc": return a.amount - b.amount;
        case "amount_desc": return b.amount - a.amount;
        case "name": return (a.productTitle || "").localeCompare(b.productTitle || "");
        case "sold_desc": return (b.sold || 0) - (a.sold || 0);
        case "value_desc": return val(b) - val(a);
        default: return 0;
      }
    });
  }, [stocks, search, filter, sort]);

  const dirty = useMemo(
    () => stocks.filter((s) => edits[s.skuId] != null && edits[s.skuId] !== s.amount),
    [stocks, edits],
  );

  const setVal = (skuId: number, raw: number, original: number) => {
    const v = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
    setEdits((prev) => {
      const next = { ...prev };
      if (v === original) delete next[skuId];
      else next[skuId] = v;
      return next;
    });
  };

  const revertOne = (skuId: number) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
  };

  const saveAll = async () => {
    if (dirty.length === 0) return;
    await setStocks.mutateAsync(dirty.map((s) => ({ skuId: s.skuId, amount: edits[s.skuId] })));
    setEdits({});
    setShowChanges(false);
  };

  // ── Lightbox navigatsiyasi ───────────────────────────────────────────
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const stepLightbox = useCallback((dir: 1 | -1) => {
    setLightbox((cur) => {
      if (cur == null || filtered.length === 0) return cur;
      return (cur + dir + filtered.length) % filtered.length;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (lightbox == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") stepLightbox(1);
      else if (e.key === "ArrowLeft") stepLightbox(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox, stepLightbox]);

  const exportXlsx = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Uzum Dashboard";
    wb.created = new Date();
    const ws = wb.addWorksheet("FBS qoldiqlari");
    ws.columns = [
      { header: "№", key: "n", width: 6 },
      { header: "Mahsulot", key: "name", width: 48 },
      { header: "SKU", key: "sku", width: 22 },
      { header: "Artikul (barcode)", key: "barcode", width: 18 },
      { header: "Qoldiq", key: "amount", width: 10 },
      { header: "Sotilgan", key: "sold", width: 10 },
      { header: "Narx (so'm)", key: "price", width: 14 },
      { header: "Tan narx (so'm)", key: "cost", width: 14 },
      { header: "Qiymat (so'm)", key: "value", width: 16 },
      { header: "FBS holati", key: "linked", width: 12 },
      { header: "Kategoriya", key: "category", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    stocks.forEach((s, i) => {
      ws.addRow({
        n: i + 1,
        name: s.productTitle,
        sku: s.skuTitle,
        barcode: s.barcode,
        amount: s.amount,
        sold: s.sold,
        price: s.price,
        cost: s.purchasePrice,
        value: s.amount * (s.price || 0),
        linked: s.fbsLinked ? "Ulangan" : "Ulanmagan",
        category: s.category,
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fbs-qoldiqlar-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const totalUnits = data?.totalUnits ?? 0;
  const totalValue = data?.totalValue ?? 0;

  const filterTabs: { id: FilterId; label: string; count: number }[] = [
    { id: "all", label: "Barchasi", count: productCounts.all },
    { id: "in_stock", label: "Sotuvda", count: productCounts.in_stock },
    { id: "out_of_stock", label: "Tugaganlar", count: productCounts.out_of_stock },
    { id: "unlinked", label: "Ulanmagan", count: productCounts.unlinked },
  ];

  const lightboxItem = lightbox != null ? filtered[lightbox] : null;

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        title="Inventar — FBS qoldiqlari"
        subtitle="Mahsulot qoldiqlarini ko'rish va yangilash"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={exportXlsx}
              disabled={!stocks.length}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10b981]/15 border border-[#10b981]/30 text-xs font-medium text-[#10b981] hover:bg-[#10b981]/25 transition-all disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={() => refresh()}
              disabled={isFetching}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
              Yangilash
            </button>
          </div>
        }
      />

      {/* Summary cards — TOVAR (mahsulot) bo'yicha */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Jami mahsulot", value: `${fmtNum(productCounts.all)} ta`, sub: `${fmtNum(stocks.length)} SKU`, icon: Boxes, color: "#8b5cf6" },
          { label: "Jami qoldiq", value: `${fmtNum(totalUnits)} dona`, sub: "barcha SKU bo'yicha", icon: Package, color: "#10b981" },
          { label: "Tugagan mahsulot", value: `${fmtNum(productCounts.out_of_stock)} ta`, sub: `${productCounts.unlinked} ulanmagan`, icon: AlertTriangle, color: "#f59e0b" },
          { label: "Qoldiq qiymati", value: fmtSom(totalValue), sub: "sotuv narxida", icon: TrendingUp, color: "#06b6d4" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${s.color}18` }}>
              <s.icon className="w-4.5 h-4.5" style={{ color: s.color }} />
            </div>
            <p className="text-xs text-[#52525b] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-white truncate" title={s.value}>{s.value}</p>
            <p className="text-[11px] text-[#52525b] mt-0.5">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + filters + sort */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mahsulot nomi, SKU yoki artikul..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-[#0f0f16] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-medium whitespace-nowrap transition-all",
                filter === t.id ? "bg-[#8b5cf6] text-white" : "bg-[#0f0f16] border border-[#27272a] text-[#71717a] hover:text-white",
              )}
            >
              {t.label}
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", filter === t.id ? "bg-white/20" : "bg-[#27272a]")}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b] pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            className="h-10 pl-9 pr-8 rounded-xl bg-[#0f0f16] border border-[#27272a] text-xs text-white focus:outline-none focus:border-[#8b5cf6] appearance-none cursor-pointer"
          >
            <option value="newest">Eng yangilari</option>
            <option value="amount_desc">Qoldiq: ko'pdan</option>
            <option value="amount_asc">Qoldiq: kamdan</option>
            <option value="sold_desc">Eng ko'p sotilgan</option>
            <option value="value_desc">Qiymat: yuqori</option>
            <option value="name">Nomi (A–Z)</option>
          </select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 text-[#8b5cf6] animate-spin" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl bg-[#ef4444]/8 border border-[#ef4444]/20 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-[#ef4444] mx-auto mb-2" />
          <p className="text-sm text-white font-semibold">Qoldiqlarni yuklab bo'lmadi</p>
          <p className="text-xs text-[#a1a1aa] mt-1">Uzum API ulanmagan yoki xato yuz berdi.</p>
          <button onClick={() => refresh()} className="mt-3 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium">Qayta urinish</button>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
          {/* header row */}
          <div className="hidden md:grid grid-cols-[1fr_140px_120px_180px] gap-4 px-5 py-3 border-b border-[#18181b] text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">
            <div>Mahsulot</div>
            <div className="text-right">Sotilgan / Narx</div>
            <div className="text-right">Qiymat</div>
            <div className="text-center">Qoldiq</div>
          </div>

          <div className="divide-y divide-[#18181b]">
            {filtered.map((s, i) => {
              const cur = edits[s.skuId] ?? s.amount;
              const isDirty = edits[s.skuId] != null && edits[s.skuId] !== s.amount;
              return (
                <div
                  key={s.skuId}
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-[1fr_140px_120px_180px] gap-3 md:gap-4 px-5 py-3.5 items-center transition-colors",
                    isDirty ? "bg-[#8b5cf6]/8" : "hover:bg-[#18181b]/40",
                  )}
                >
                  {/* product */}
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => s.image && setLightbox(i)}
                      className="group relative w-12 h-12 rounded-lg bg-[#18181b] overflow-hidden flex items-center justify-center ring-1 ring-[#27272a] flex-shrink-0 cursor-zoom-in disabled:cursor-default"
                      disabled={!s.image}
                    >
                      {s.image ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.image} alt={s.productTitle} className="w-full h-full object-cover transition-transform group-hover:scale-110" referrerPolicy="no-referrer" />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ZoomIn className="w-4 h-4 text-white" />
                          </span>
                        </>
                      ) : (
                        <Package className="w-5 h-5 text-[#3f3f46]" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate leading-snug" title={s.productTitle}>{s.productTitle || "Nomsiz"}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#18181b] text-[#a1a1aa]">{s.skuTitle}</span>
                        <span className="text-[11px] font-mono text-[#52525b]">{s.barcode}</span>
                        {!s.fbsLinked && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-semibold">
                            <Link2Off className="w-2.5 h-2.5" /> Ulanmagan
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* sold / price */}
                  <div className="text-left md:text-right">
                    <p className="text-xs text-[#a1a1aa] flex items-center md:justify-end gap-1">
                      <ShoppingCart className="w-3 h-3 text-[#52525b]" />
                      <span className="font-semibold text-white">{fmtNum(s.sold)}</span> sotilgan
                    </p>
                    <p className="text-[11px] text-[#71717a] mt-0.5">{s.price ? fmtSom(s.price) : "—"}</p>
                  </div>

                  {/* value */}
                  <div className="text-left md:text-right">
                    <p className="text-sm font-semibold text-white tabular-nums">{fmtNum(cur * (s.price || 0))}</p>
                    <p className="text-[10px] text-[#52525b]">so'm</p>
                  </div>

                  {/* stock editor */}
                  <div className="flex items-center md:justify-center gap-1.5">
                    <button
                      onClick={() => setVal(s.skuId, cur - 1, s.amount)}
                      className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] flex items-center justify-center transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={cur}
                      onChange={(e) => setVal(s.skuId, parseInt(e.target.value, 10), s.amount)}
                      onFocus={(e) => e.target.select()}
                      className={cn(
                        "w-20 h-9 text-center rounded-lg bg-[#0a0a0f] border text-sm font-bold tabular-nums focus:outline-none transition-all",
                        isDirty ? "border-[#8b5cf6] text-[#a78bfa] ring-1 ring-[#8b5cf6]/30"
                          : cur === 0 ? "border-[#27272a] text-[#ef4444]" : "border-[#27272a] text-white",
                      )}
                    />
                    <button
                      onClick={() => setVal(s.skuId, cur + 1, s.amount)}
                      className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] flex items-center justify-center transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center text-xs text-[#52525b]">Mahsulot topilmadi</div>
          )}

          <div className="px-5 py-3 border-t border-[#18181b] flex items-center justify-between">
            <p className="text-xs text-[#52525b]">{fmtNum(filtered.length)} ta SKU ko'rsatilmoqda</p>
            {isFetching && <span className="text-[11px] text-[#52525b] flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> yangilanmoqda</span>}
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <AnimatePresence>
        {dirty.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
          >
            <div className="rounded-2xl bg-[#13131a] border border-[#8b5cf6]/40 shadow-2xl shadow-black/50 px-4 py-3 flex items-center justify-between gap-3 backdrop-blur">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-[#8b5cf6]/15 text-[#a78bfa] flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4" />
                </span>
                <p className="text-sm text-white">
                  <span className="font-bold">{dirty.length}</span> ta qoldiq o'zgartirildi
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowChanges(true)}
                  disabled={setStocks.isPending}
                  className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ListChecks className="w-3.5 h-3.5" /> Ko'rish
                </button>
                <button
                  onClick={() => setEdits({})}
                  disabled={setStocks.isPending}
                  className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Bekor qilish
                </button>
                <button
                  onClick={saveAll}
                  disabled={setStocks.isPending}
                  className="px-4 py-2 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-xs font-semibold transition-all disabled:opacity-60 flex items-center gap-1.5 shadow-lg shadow-[#8b5cf6]/20"
                >
                  {setStocks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Saqlash
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* O'zgartirilganlarni ko'rish — modal */}
      <AnimatePresence>
        {showChanges && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowChanges(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-[#0f0f16] border border-[#27272a] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#18181b]">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-[#8b5cf6]/15 text-[#a78bfa] flex items-center justify-center">
                    <ListChecks className="w-4.5 h-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">O'zgartirilgan qoldiqlar</p>
                    <p className="text-[11px] text-[#52525b]">{dirty.length} ta SKU — saqlashdan oldin tekshiring</p>
                  </div>
                </div>
                <button onClick={() => setShowChanges(false)} className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto divide-y divide-[#18181b]">
                {dirty.length === 0 && (
                  <div className="py-12 text-center text-xs text-[#52525b]">O'zgartirish yo'q</div>
                )}
                {dirty.map((s) => {
                  const next = edits[s.skuId];
                  const diff = next - s.amount;
                  return (
                    <div key={s.skuId} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-10 h-10 rounded-lg bg-[#18181b] overflow-hidden flex items-center justify-center ring-1 ring-[#27272a] flex-shrink-0">
                        {s.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.image} alt={s.productTitle} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Package className="w-4 h-4 text-[#3f3f46]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate" title={s.productTitle}>{s.productTitle || "Nomsiz"}</p>
                        <p className="text-[11px] font-mono text-[#52525b] truncate">{s.skuTitle} · {s.barcode}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-bold tabular-nums text-[#71717a]">{fmtNum(s.amount)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#52525b]" />
                        <span className="text-sm font-bold tabular-nums text-[#a78bfa]">{fmtNum(next)}</span>
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums w-14 text-center",
                          diff > 0 ? "bg-[#10b981]/15 text-[#10b981]" : "bg-[#ef4444]/15 text-[#ef4444]",
                        )}>
                          {diff > 0 ? "+" : ""}{fmtNum(diff)}
                        </span>
                        <button
                          onClick={() => revertOne(s.skuId)}
                          title="Bu o'zgarishni bekor qilish"
                          className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white flex items-center justify-center"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#18181b] mt-auto">
                <button
                  onClick={() => { setEdits({}); setShowChanges(false); }}
                  disabled={setStocks.isPending}
                  className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all disabled:opacity-50"
                >
                  Hammasini bekor qilish
                </button>
                <button
                  onClick={saveAll}
                  disabled={setStocks.isPending || dirty.length === 0}
                  className="px-5 py-2 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-xs font-semibold transition-all disabled:opacity-60 flex items-center gap-1.5 shadow-lg shadow-[#8b5cf6]/20"
                >
                  {setStocks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {dirty.length} ta qoldiqni saqlash
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rasm lightbox */}
      <AnimatePresence>
        {lightboxItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={closeLightbox}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); stepLightbox(-1); }}
              className="absolute left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); stepLightbox(1); }}
              className="absolute right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            <motion.div
              key={lightboxItem.skuId}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hiResImage(lightboxItem.image) || lightboxItem.image || ""}
                alt={lightboxItem.productTitle}
                referrerPolicy="no-referrer"
                className="max-w-[88vw] max-h-[72vh] object-contain rounded-2xl bg-[#0f0f16] shadow-2xl"
              />
              <div className="text-center max-w-xl">
                <p className="text-sm font-semibold text-white">{lightboxItem.productTitle || "Nomsiz"}</p>
                <p className="text-xs text-[#a1a1aa] mt-1 font-mono">
                  {lightboxItem.skuTitle} · {lightboxItem.barcode} · Qoldiq: {fmtNum(edits[lightboxItem.skuId] ?? lightboxItem.amount)}
                </p>
                <p className="text-[11px] text-[#52525b] mt-1">{(lightbox ?? 0) + 1} / {filtered.length}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
