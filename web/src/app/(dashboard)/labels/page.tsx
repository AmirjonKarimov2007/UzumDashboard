"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, Search, Package, AlertCircle, Sparkles, Loader2,
  QrCode, ChevronLeft, ChevronRight, Check, Minus, Plus, X,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useLiveProducts, useProductMeta } from "@/hooks/use-products";
import { useSyncStatus } from "@/hooks/use-sync";
import { printQrLabels, type QrLabelEntry } from "@/lib/qr-print";
import { HandlingLabelsPanel } from "@/components/labels/handling-labels-panel";
import { toast } from "sonner";

function uzumThumb(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/\/t_product_|\/original\.jpg|\.jpg$/i.test(raw)) {
    return raw.replace(/\/(t_product_[^/]+|original\.jpg)$/i, "/t_product_240_high.jpg");
  }
  return raw + "/t_product_240_high.jpg";
}
function getImageUrl(p: any): string | null {
  if (Array.isArray(p.imageUrls) && p.imageUrls.length) return p.imageUrls[0];
  return p.image || p.previewImg || p.previewImage || null;
}

interface SkuVariant {
  skuId: number | string;
  barcode: string;
  skuFull: string;   // "H2007-XP4667-СЕРЫЙ" — goes on the QR label
  variant: string;   // short colour/characteristic, e.g. "СЕРЫЙ" — for display
  articleCode?: string | null;
  xid?: string | null;
}
interface ProductCard {
  productId: number | string;
  title: string;
  image: string | null;
  skus: SkuVariant[];
}

function NotConnectedState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[#3f3f46]" />
      </div>
      <p className="text-sm font-semibold text-white mb-1">Uzum API ulanmagan</p>
      <p className="text-xs text-[#52525b] mb-4 max-w-xs">Yorliqlarni chiqarish uchun Uzum do'koningizni ulang</p>
      <Link href="/settings" className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        API ulash
      </Link>
    </div>
  );
}

export default function LabelsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 24;
  const [selected, setSelected] = useState<Map<string, number>>(new Map()); // barcode → qty
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [mode, setMode] = useState<"qr" | "handling">("qr");

  const { data: syncStatus } = useSyncStatus();
  const isConnected = syncStatus?.isConnected;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data: metaMap } = useProductMeta();
  const searching = debouncedSearch.trim().length > 0;

  const { data: meta } = useLiveProducts({ page: 0, size: 1 });
  const total = meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Uzum's natural order is OLDEST-first → walk pages backward + reverse within page.
  // When searching we fetch a large batch once and filter client-side (so custom
  // Article/XID also match — Uzum server search only knows name/SKU).
  const effectivePage = Math.max(0, totalPages - 1 - page);
  const { data, isLoading, isFetching, refetch } = useLiveProducts({
    page: searching ? 0 : effectivePage,
    size: searching ? Math.min(2000, Math.max(total, 100)) : pageSize,
  });

  // Group SKUs UNDER their product (newest products on top), merge seller meta
  const allCards: ProductCard[] = useMemo(() => {
    const ordered = [...(data?.products || [])].reverse();
    return ordered.map((p: any) => {
      const skus: SkuVariant[] = (Array.isArray(p.skuList) && p.skuList.length ? p.skuList : [])
        .map((s: any) => {
          const m = metaMap?.[s.skuId];
          return {
            skuId: s.skuId ?? "",
            barcode: String(s.barcode || "").trim(),
            skuFull: s.skuFullTitle || s.skuTitle || "",
            variant: s.skuTitle || s.skuFullTitle || "",
            articleCode: m?.articleCode ?? null,
            xid: m?.xid ?? null,
          };
        })
        .filter((s: SkuVariant) => s.barcode);
      return {
        productId: p.productId,
        title: p.title || "Nomsiz",
        image: uzumThumb(getImageUrl(p)),
        skus,
      };
    }).filter((c: ProductCard) => c.skus.length > 0);
  }, [data?.products, metaMap]);

  // Client-side search across name, SKU, barcode, Article code and XID
  const cards: ProductCard[] = useMemo(() => {
    if (!searching) return allCards;
    const q = debouncedSearch.trim().toLowerCase();
    return allCards.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      String(c.productId).toLowerCase().includes(q) ||
      c.skus.some((s) =>
        String(s.skuId).toLowerCase().includes(q) ||
        s.barcode.toLowerCase().includes(q) ||
        (s.skuFull || "").toLowerCase().includes(q) ||
        (s.articleCode || "").toLowerCase().includes(q) ||
        (s.xid || "").toLowerCase().includes(q),
      ),
    );
  }, [allCards, searching, debouncedSearch]);

  // barcode → variant lookup (for building print entries)
  const skuByBarcode = useMemo(() => {
    const m = new Map<string, SkuVariant>();
    for (const c of cards) for (const s of c.skus) m.set(s.barcode, s);
    return m;
  }, [cards]);

  const totalLabels = useMemo(() => Array.from(selected.values()).reduce((s, q) => s + q, 0), [selected]);

  const toggle = (barcode: string) => {
    setSelected((prev) => {
      const n = new Map(prev);
      if (n.has(barcode)) n.delete(barcode); else n.set(barcode, 1);
      return n;
    });
  };
  const setQty = (barcode: string, qty: number) => {
    setSelected((prev) => {
      const n = new Map(prev);
      if (qty <= 0) n.delete(barcode); else n.set(barcode, Math.min(999, qty));
      return n;
    });
  };
  // Select/deselect every SKU of a product at once
  const toggleProduct = (card: ProductCard) => {
    const allSelected = card.skus.every((s) => selected.has(s.barcode));
    setSelected((prev) => {
      const n = new Map(prev);
      if (allSelected) card.skus.forEach((s) => n.delete(s.barcode));
      else card.skus.forEach((s) => { if (!n.has(s.barcode)) n.set(s.barcode, 1); });
      return n;
    });
  };
  const clearAll = () => setSelected(new Map());

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setPrinting(true);
    setProgress({ done: 0, total: totalLabels });
    try {
      const entries: QrLabelEntry[] = [];
      for (const [barcode, qty] of selected.entries()) {
        const s = skuByBarcode.get(barcode);
        entries.push({ barcode, skuTitle: s?.skuFull || "", count: qty });
      }
      const n = await printQrLabels(entries, (done, t) => setProgress({ done, total: t }));
      toast.success(`${n} ta yorliq chop etishga yuborildi`);
    } catch (err: any) {
      toast.error(`Yorliqlarni chiqarib bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-5 pb-28">
      <PageHeader
        title="Yorliqlar"
        subtitle={
          mode === "qr"
            ? `Mahsulotlarni belgilab QR yorliqlarini chiqaring${total ? ` · ${total} ta mahsulot` : ""}`
            : "Qadoqlash belgilari — sonini kiritib chop eting"
        }
        action={
          mode === "qr" && isConnected ? (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#71717a] hover:text-white hover:border-[#27272a] transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
              <span className="hidden md:inline">Yangilash</span>
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f0f16] border border-[#1c1c24] w-fit">
        {(
          [
            { id: "qr", label: "QR yorliqlar", icon: QrCode },
            { id: "handling", label: "Belgi yorliqlar", icon: Sparkles },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
              mode === t.id ? "bg-[#8b5cf6] text-white" : "text-[#71717a] hover:text-white",
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {mode === "handling" ? (
        <HandlingLabelsPanel />
      ) : !isConnected ? (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24]">
          <NotConnectedState />
        </div>
      ) : (
        <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Mahsulot nomi yoki SKU bo'yicha qidirish..."
          className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30"
        />
      </div>

      {/* Product cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] py-16 text-center">
          <Package className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Mahsulot topilmadi</p>
          <p className="text-xs text-[#52525b] mt-1">Qidiruvni o'zgartirib ko'ring</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cards.map((card, i) => {
            const selCount = card.skus.filter((s) => selected.has(s.barcode)).length;
            const allSel = selCount === card.skus.length;
            const single = card.skus.length === 1;
            return (
              <motion.div
                key={card.productId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.2) }}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  selCount > 0 ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/[0.06]" : "border-[#1c1c24] bg-[#0f0f16]"
                )}
              >
                {/* Product header */}
                <div
                  onClick={() => toggleProduct(card)}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/[0.02]"
                >
                  <div className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all",
                    allSel ? "bg-[#8b5cf6] border-[#8b5cf6]" : selCount > 0 ? "bg-[#8b5cf6]/40 border-[#8b5cf6]" : "border-[#3f3f46]"
                  )}>
                    {selCount > 0 && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-[#18181b] overflow-hidden flex-shrink-0 flex items-center justify-center ring-1 ring-[#27272a]">
                    {card.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.image} alt={card.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Package className="w-5 h-5 text-[#3f3f46]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white line-clamp-2 leading-snug" title={card.title}>{card.title}</p>
                    <p className="text-[11px] text-[#71717a] mt-0.5">
                      {single ? card.skus[0].skuFull : `${card.skus.length} ta variant`}
                    </p>
                  </div>
                </div>

                {/* SKU variants (only when product has >1, or always show controls inline for single) */}
                <div className="border-t border-[#1c1c24] divide-y divide-[#1c1c24]/60">
                  {card.skus.map((s) => {
                    const isSel = selected.has(s.barcode);
                    const qty = selected.get(s.barcode) ?? 0;
                    return (
                      <div
                        key={s.barcode}
                        onClick={() => toggle(s.barcode)}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                          isSel ? "bg-[#8b5cf6]/[0.08]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                          isSel ? "bg-[#8b5cf6] border-[#8b5cf6]" : "border-[#3f3f46]"
                        )}>
                          {isSel && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {!single && <p className="text-xs text-white truncate">{s.variant}</p>}
                          <p className="text-[11px] font-mono text-[#71717a] truncate">{s.barcode}</p>
                        </div>
                        {isSel && (
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setQty(s.barcode, qty - 1)}
                              className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa]"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={qty}
                              onChange={(e) => setQty(s.barcode, parseInt(e.target.value || "0", 10))}
                              className="w-12 h-7 text-center rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white tabular-nums focus:outline-none focus:border-[#8b5cf6] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => setQty(s.barcode, qty + 1)}
                              className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!searching && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[#52525b]">
            Sahifa <span className="text-white font-medium">{page + 1}</span> / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0f0f16] border border-[#1c1c24] text-xs text-white hover:border-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3 h-3" /> Oldingi
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1 || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0f0f16] border border-[#1c1c24] text-xs text-white hover:border-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingi <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="rounded-2xl bg-[#13131a]/95 backdrop-blur border border-[#8b5cf6]/30 shadow-2xl shadow-black/50 p-3 flex items-center gap-3">
            <button
              onClick={clearAll}
              className="w-9 h-9 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa] flex-shrink-0"
              title="Tozalash"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {selected.size} ta SKU · {totalLabels} ta yorliq
              </p>
              <p className="text-[11px] text-[#71717a]">40×30mm QR yorliqlar chop etiladi</p>
            </div>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-sm font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#8b5cf6]/20 flex-shrink-0"
            >
              {printing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress.total > 0 ? `${progress.done}/${progress.total}` : "..."}
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4" />
                  QR chiqarish
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
        </>
      )}
    </div>
  );
}
