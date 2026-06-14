"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package, RefreshCw, AlertCircle, Loader2, Sparkles,
  LayoutGrid, List as ListIcon, Copy, Check, X, Star,
  TrendingUp, Box, Hash, Tag, Percent, ShoppingCart,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ExternalLink,
  ZoomIn, Save, Pencil, Wallet,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useLiveProducts, useProductMeta, useUpsertProductMeta } from "@/hooks/use-products";
import { useSyncStatus } from "@/hooks/use-sync";
import { useDashboardStore } from "@/stores/dashboard-store";
import { usdToUzs } from "@/lib/currency";

type Filter = "ALL" | "ACTIVE" | "INACTIVE" | "ARCHIVE" | "DEFECTED" | "WARNING";
type ViewMode = "grid" | "list";
type SortByOption = "DEFAULT" | "ID" | "ORDERS" | "PRICE" | "ROI" | "CONVERSION" | "LEFTOVERS";

const filterOptions: { id: Filter; label: string }[] = [
  { id: "ALL",      label: "Barchasi" },
  { id: "ACTIVE",   label: "Faol" },
  { id: "INACTIVE", label: "Nofaol" },
  { id: "ARCHIVE",  label: "Arxiv" },
  { id: "WARNING",  label: "Ogohlantirish" },
  { id: "DEFECTED", label: "Brak" },
];

const sortOptions: { id: SortByOption; label: string }[] = [
  { id: "DEFAULT",    label: "Eng yangilari" },
  { id: "ID",         label: "ID bo'yicha" },
  { id: "ORDERS",     label: "Eng ko'p sotilgan" },
  { id: "PRICE",      label: "Narx bo'yicha" },
  { id: "ROI",        label: "ROI" },
  { id: "CONVERSION", label: "Konversiya" },
  { id: "LEFTOVERS",  label: "Qoldiq" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  IN_STOCK:        { label: "Sotuvda",     color: "#10b981", bg: "rgba(16,185,129,.15)" },
  READY_TO_SEND:   { label: "Tayyor",      color: "#10b981", bg: "rgba(16,185,129,.15)" },
  RUN_OUT:         { label: "Tugab qoldi", color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
  ARCHIVED:        { label: "Arxiv",       color: "#71717a", bg: "rgba(113,113,122,.15)" },
  BLOCKED:         { label: "Bloklangan",  color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  SKU_BLOCKED:     { label: "SKU blok",    color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  NO_SKU:          { label: "SKU yo'q",    color: "#71717a", bg: "rgba(113,113,122,.15)" },
  SENT:            { label: "Yuborilgan",  color: "#3b82f6", bg: "rgba(59,130,246,.15)" },
  NOT_READY_TO_SEND: { label: "Tayyor emas", color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
};

const rankConfig: Record<string, { color: string; bg: string }> = {
  A: { color: "#10b981", bg: "rgba(16,185,129,.18)" },
  B: { color: "#3b82f6", bg: "rgba(59,130,246,.18)" },
  C: { color: "#f59e0b", bg: "rgba(245,158,11,.18)" },
  D: { color: "#ef4444", bg: "rgba(239,68,68,.18)" },
  N: { color: "#71717a", bg: "rgba(113,113,122,.18)" },
};

/** Build hi-res Uzum image URL from API field */
function uzumImageUrl(raw: string | null | undefined, size: "thumb" | "medium" | "high" = "high"): string | null {
  if (!raw) return null;
  // If it already has /something.jpg, return as-is for high. For other sizes — replace.
  if (raw.match(/\/t_product_|\/original\.jpg|\.jpg$/i)) {
    if (size === "high") return raw.replace(/\/(t_product_[^/]+|original\.jpg)$/i, "/original.jpg");
    if (size === "medium") return raw.replace(/\/(t_product_[^/]+|original\.jpg)$/i, "/t_product_540_high.jpg");
    if (size === "thumb") return raw.replace(/\/(t_product_[^/]+|original\.jpg)$/i, "/t_product_240_high.jpg");
    return raw;
  }
  // Base URL only — append suffix
  const suffix = size === "high" ? "/original.jpg" : size === "medium" ? "/t_product_540_high.jpg" : "/t_product_240_high.jpg";
  return raw + suffix;
}

/** Get first image URL from imageUrls array or single image */
function getImageUrl(product: any): string | null {
  // Try imageUrls array first (from Uzum API)
  if (product.imageUrls && Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
    return product.imageUrls[0];
  }
  // Fall back to image field
  if (product.image) return product.image;
  // Try previewImg
  if (product.previewImg) return product.previewImg;
  // Try previewImage (from SKU)
  if (product.previewImage) return product.previewImage;
  return null;
}

function NotConnectedState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[#3f3f46]" />
      </div>
      <p className="text-sm font-semibold text-white mb-1">Uzum API ulanmagan</p>
      <p className="text-xs text-[#52525b] mb-4 max-w-xs">Mahsulotlarni ko'rish uchun Uzum do'koningizni ulang</p>
      <Link href="/settings" className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        API ulash
      </Link>
    </div>
  );
}

function CopyableId({ value, label, mono = true }: { value: string | number; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1c1c24] transition-all"
      title={`Nusxa olish: ${value}`}
    >
      {label && <span className="text-[9px] uppercase tracking-wider text-[#52525b] font-semibold">{label}</span>}
      <span className={cn("text-[11px] text-[#e4e4e7]", mono && "font-mono")}>{value}</span>
      {copied ? (
        <Check className="w-3 h-3 text-[#10b981]" />
      ) : (
        <Copy className="w-3 h-3 text-[#52525b] group-hover:text-[#a1a1aa] transition-colors" />
      )}
    </button>
  );
}

function ProductCard({ row, view, onClick, index }: { row: any; view: ViewMode; onClick: () => void; index: number }) {
  const st = statusConfig[row.statusValue] || { label: row.statusTitle || row.statusValue, color: "#71717a", bg: "rgba(113,113,122,.15)" };
  const rank = rankConfig[row.rank] || rankConfig.N;
  const imgUrl = uzumImageUrl(row.image, view === "grid" ? "high" : "medium");

  if (view === "list") {
    return (
      <div
        onClick={onClick}
        style={{ animationDelay: `${Math.min(index * 20, 240)}ms` }}
        className="animate-fade-in cv-auto rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-3 hover:border-[#3f3f46] hover:bg-[#13131a] transition-all cursor-pointer flex items-center gap-3"
      >
        <div className="relative w-16 h-16 rounded-lg bg-[#18181b] flex-shrink-0 overflow-hidden flex items-center justify-center">
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt={row.title} loading="lazy"
              className="w-full h-full object-contain p-1"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = uzumImageUrl(row.image, "medium") || "";
                }
              }}
            />
          ) : (
            <Package className="w-6 h-6 text-[#3f3f46]" />
          )}
          <div className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold backdrop-blur-sm"
            style={{ color: rank.color, background: rank.bg }}>
            {row.rank}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-white truncate flex-1" title={row.title}>{row.title}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0"
              style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CopyableId value={row.productId} label="ID" />
            {row.skuId && <CopyableId value={row.skuId} label="SKU" />}
            {row.meta?.articleCode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#18181b] text-[#a1a1aa] font-mono">{row.meta.articleCode}</span>}
            {row.meta?.xid && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#18181b] text-[#a1a1aa] font-mono">XID:{row.meta.xid}</span>}
          </div>
          <div className="mt-1">
            {row.meta?.costPrice != null
              ? <span className="text-[11px] text-[#10b981] font-medium">Tan narx: {fmtCostUsd(row.meta.costPrice)}</span>
              : <span className="text-[11px] text-[#f59e0b]">Tan narx kiritish</span>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-[#52525b]">Narx</p>
            <p className="text-sm font-bold text-white">{formatCurrency(row.price)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#52525b]">Sotilgan</p>
            <p className="text-sm font-semibold text-[#10b981]">{row.quantitySold}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#52525b]">Qoldiq</p>
            <p className="text-sm font-semibold text-white">{row.quantityActive + row.quantityFbs}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[#52525b] flex-shrink-0" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index * 20, 240)}ms` }}
      className="animate-fade-in cv-auto rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden hover:border-[#3f3f46] hover:shadow-xl hover:shadow-[#8b5cf6]/5 transition-all cursor-pointer group"
    >
      <div className="relative aspect-square bg-gradient-to-br from-[#18181b] to-[#0a0a0f] overflow-hidden flex items-center justify-center">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={row.title} loading="lazy"
            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              if (!img.dataset.fallback) {
                img.dataset.fallback = "1";
                img.src = uzumImageUrl(row.image, "medium") || "";
              } else {
                img.style.display = "none";
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-[#27272a]" />
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md text-[10px] font-semibold backdrop-blur-md"
          style={{ color: st.color, background: st.bg }}>{st.label}</div>
        <div className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold backdrop-blur-md"
          style={{ color: rank.color, background: rank.bg }}>{row.rank}</div>
      </div>
      <div className="p-3 space-y-2.5">
        <p className="text-xs font-medium text-white line-clamp-2 min-h-[2.5rem] leading-snug" title={row.title}>{row.title}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <CopyableId value={row.productId} label="ID" />
          {row.skuId && <CopyableId value={row.skuId} label="SKU" />}
        </div>
        <div className="flex items-end justify-between pt-1 border-t border-[#18181b]">
          <div>
            <p className="text-[10px] text-[#52525b]">Narx</p>
            <p className="text-sm font-bold text-white">{formatCurrency(row.price)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#52525b]">Sotilgan</p>
            <p className="text-sm font-semibold text-[#10b981]">{row.quantitySold}</p>
          </div>
        </div>
        <div className="text-center py-1 rounded-lg" style={{ background: row.meta?.costPrice != null ? "rgba(16,185,129,.1)" : "rgba(245,158,11,.1)" }}>
          {row.meta?.costPrice != null
            ? <span className="text-[11px] text-[#10b981] font-semibold">Tan narx: {fmtCostUsd(row.meta.costPrice)}</span>
            : <span className="text-[11px] text-[#f59e0b] font-medium">Tan narx kiritish</span>}
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
          <div className="text-center">
            <p className="text-[#52525b]">Aktiv</p>
            <p className="text-white font-semibold">{row.quantityActive}</p>
          </div>
          <div className="text-center">
            <p className="text-[#52525b]">FBS</p>
            <p className="text-white font-semibold">{row.quantityFbs}</p>
          </div>
          <div className="text-center">
            <p className="text-[#52525b]">Komiss.</p>
            <p className="text-white font-semibold">{row.commission}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-md"
      >
        <X className="w-5 h-5 text-white" />
      </button>
      <motion.img
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}

// Format an integer string with thousand spaces: "31600" → "31 600"
function fmtNum(v: string | number): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
const parseNum = (v: string): number | null => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d ? Number(d) : null;
};

// Format price with "so'm" suffix: "150 000 so'm"
function fmtPrice(v: string | number | null | undefined): string {
  const num = parseNum(String(v ?? ""));
  if (!num) return "";
  return `${fmtNum(num)} so'm`;
}

// ── USD cost helpers (tan narx USD da kiritiladi) ──
// Allow a single decimal point + up to 2 decimals; group the integer part by 3s.
function fmtUsd(v: string | number): string {
  let s = String(v ?? "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  const [intRaw = "", decRaw] = s.split(".");
  const intPart = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decRaw !== undefined ? `${intPart}.${decRaw.slice(0, 2)}` : intPart;
}
const parseUsd = (v: string): number | null => {
  const s = String(v ?? "").replace(/[^\d.]/g, "");
  if (!s || s === ".") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};
// Full UZS amount with thousand separators (NO "ming"/"mln" abbreviation): "5 250 so'm"
function fmtSom(v: number): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(Number(v) || 0)) + " so'm";
}

// Display a stored USD cost as "$12.50"
function fmtCostUsd(v: string | number | null | undefined): string {
  const n = typeof v === "number" ? v : parseUsd(String(v ?? ""));
  if (n == null || !n) return "";
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── Uzum logistika (VGT) hisoblash ──
// Hajm (litr) = uzunlik × kenglik × balandlik (mm) / 1 000 000
function skuVolumeLiters(dim?: { length?: number; width?: number; height?: number } | null): number {
  if (!dim) return 0;
  const l = Number(dim.length || 0), w = Number(dim.width || 0), h = Number(dim.height || 0);
  if (l <= 0 || w <= 0 || h <= 0) return 0;
  return (l * w * h) / 1_000_000;
}
// Tarif: hajmni yuqoriga butun litrga yaxlitlash (ceil), so'ng:
//   5 250 so'm (har birlik) + 250 so'm (1 litrdan ortiq har butun litr), maks 50 000 so'm
function calcLogisticsFee(volumeLiters: number): number {
  const BASE = 5250;
  const PER_EXTRA_LITER = 250;
  const MAX = 50000;
  const rounded = Math.ceil(volumeLiters); // 0.504 → 1, 1.2 → 2, 6.918 → 7
  const extra = rounded > 1 ? (rounded - 1) * PER_EXTRA_LITER : 0;
  return Math.min(BASE + extra, MAX);
}

// Calculate net profit after Uzum commission and logistics
// Uzum commission is percentage, logistics is estimated per-item base + percentage
function calculateNetProfit(
  sellingPrice: number,
  costPrice: number,
  commissionPercent: number,
  logisticsCost?: number
): { netProfit: number; netMargin: number; breakdown: { commission: number; logistics: number; totalDeductions: number } } {
  if (!sellingPrice || !costPrice) return { netProfit: 0, netMargin: 0, breakdown: { commission: 0, logistics: 0, totalDeductions: 0 } };

  // Commission amount
  const commissionAmount = (sellingPrice * commissionPercent) / 100;

  // Logistics: prefer the VGT-based fee passed in; else the per-unit base (5 250 so'm)
  const estimatedLogistics = logisticsCost ?? 5250;

  const totalDeductions = commissionAmount + estimatedLogistics;
  const netProfit = sellingPrice - costPrice - totalDeductions;
  const netMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

  return {
    netProfit: Math.max(0, netProfit),
    netMargin: Math.max(0, netMargin),
    breakdown: {
      commission: commissionAmount,
      logistics: estimatedLogistics,
      totalDeductions,
    },
  };
}

function ProductDetailModal({ product, onClose, metaMap }: { product: any | null; onClose: () => void; metaMap?: Record<string, any> }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const upsertMeta = useUpsertProductMeta();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [costs, setCosts] = useState<Record<string, string>>({}); // skuId → formatted USD cost
  const [article, setArticle] = useState("");
  const [xid, setXid] = useState("");
  const usdRate = useDashboardStore((s) => s.usdRate);

  // The SKU variants for this product (each may have its own price & cost)
  const skuList: any[] = (product?._raw?.skuList?.length ? product._raw.skuList : [
    { skuId: product?.skuId, skuTitle: product?.skuTitle || "", price: product?.price },
  ]).filter((s: any) => s.skuId != null && String(s.skuId) !== "");
  const primarySkuId = String(skuList[0]?.skuId ?? "");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const s of skuList) {
      const m = metaMap?.[String(s.skuId)];
      next[String(s.skuId)] = m?.costPrice != null ? fmtUsd(m.costPrice) : "";
    }
    setCosts(next);
    const pm = metaMap?.[primarySkuId];
    setArticle(pm?.articleCode ?? "");
    setXid(pm?.xid ?? "");
    const anyCost = skuList.some((s: any) => metaMap?.[String(s.skuId)]?.costPrice != null);
    setEditing(!anyCost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.productId, metaMap]);

  if (!product) return null;

  const multiSku = skuList.length > 1;

  const saveMeta = async () => {
    setSaving(true);
    try {
      for (const s of skuList) {
        const sid = String(s.skuId);
        const isPrimary = sid === primarySkuId;
        await upsertMeta.mutateAsync({
          skuId: sid,
          productId: product.productId,
          costPrice: parseUsd(costs[sid] || ""),
          // Article/XID are product-level → stored on the primary SKU only
          articleCode: isPrimary ? (article.trim() || null) : undefined,
          xid: isPrimary ? (xid.trim() || null) : undefined,
        });
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  const p = product._raw;
  const imgUrl = uzumImageUrl(getImageUrl(p), "high");
  const st = statusConfig[product.statusValue] || { label: product.statusTitle || product.statusValue, color: "#71717a", bg: "rgba(113,113,122,.15)" };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-4xl bg-[#0a0a0f] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-[#a1a1aa]" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
            {/* Image */}
            <div
              className="relative aspect-square bg-gradient-to-br from-[#18181b] to-[#0a0a0f] flex items-center justify-center cursor-zoom-in group"
              onClick={() => imgUrl && setLightbox(imgUrl)}
            >
              {imgUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl} alt={product.title} referrerPolicy="no-referrer" className="w-full h-full object-contain p-4 group-hover:scale-[1.02] transition-transform" />
                  <div className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="w-4 h-4 text-white" />
                  </div>
                </>
              ) : (
                <Package className="w-24 h-24 text-[#27272a]" />
              )}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-semibold backdrop-blur-md inline-flex items-center"
                  style={{ color: st.color, background: st.bg }}>{st.label}</span>
                <span className="px-3 py-1 rounded-lg text-xs font-bold backdrop-blur-md inline-flex items-center w-fit"
                  style={{ color: rankConfig[product.rank]?.color || "#71717a", background: rankConfig[product.rank]?.bg || "rgba(113,113,122,.15)" }}>
                  Rank: {product.rank}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs text-[#71717a] mb-1">{product.category}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{product.title}</h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CopyableId value={product.productId} label="Product ID" />
                {product.skuId && <CopyableId value={product.skuId} label="SKU ID" />}
                {product.barcode && <CopyableId value={product.barcode} label="Barcode" />}
              </div>

              {product.feedbackQuantity > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Star className="w-4 h-4 text-[#f59e0b] fill-[#f59e0b]" />
                  <span className="text-white font-semibold">{product.rating.toFixed(1)}</span>
                  <span className="text-[#71717a]">·</span>
                  <span className="text-[#a1a1aa]">{product.feedbackQuantity} sharh</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Tag, label: "Narx", value: formatCurrency(product.price), color: "#8b5cf6" },
                  { icon: ShoppingCart, label: "Sotilgan", value: product.quantitySold.toLocaleString(), color: "#10b981" },
                  { icon: Box, label: "Aktiv qoldiq", value: product.quantityActive.toLocaleString(), color: "#3b82f6" },
                  { icon: Package, label: "FBS qoldiq", value: product.quantityFbs.toLocaleString(), color: "#06b6d4" },
                  { icon: Percent, label: "Komissiya", value: `${product.commission}%`, color: "#f59e0b" },
                  { icon: TrendingUp, label: "Qaytarilgan", value: product.quantityReturned.toLocaleString(), color: "#ef4444" },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                        <p className="text-[10px] text-[#52525b] uppercase tracking-wider">{stat.label}</p>
                      </div>
                      <p className="text-sm font-bold text-white">{stat.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* ── Mening ma'lumotlarim: tan narx (har SKU), article, XID ── */}
              <div className="pt-3 border-t border-[#18181b]">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs uppercase tracking-wider text-[#52525b] font-semibold flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-[#10b981]" /> Mening ma'lumotlarim
                    {multiSku && <span className="text-[10px] text-[#52525b] normal-case">· {skuList.length} SKU</span>}
                  </p>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] text-[#a78bfa] hover:text-white">
                      <Pencil className="w-3 h-3" /> Tahrirlash
                    </button>
                  )}
                </div>

                {/* Per-SKU cost rows */}
                <div className="space-y-2">
                  {skuList.map((s: any, sidx: number) => {
                    const sid = String(s.skuId);
                    const m = metaMap?.[sid];
                    const price = Number(s.price || 0);
                    // costUsd = tan narx USD da; costUzs = joriy kurs bo'yicha so'mda
                    const costUsd = editing ? parseUsd(costs[sid] || "") : (m?.costPrice != null ? Number(m.costPrice) : null);
                    const costUzs = costUsd != null ? usdToUzs(costUsd, usdRate) : null;
                    const margin = costUzs != null && price > 0 ? ((price - costUzs) / price) * 100 : null;

                    // Calculate net profit (after commission + logistics) — so'mda.
                    // Logistika VGT (hajm) bo'yicha: L×W×H(mm)/1e6 = litr → tarif.
                    const commissionPercent = product.commission || 0;
                    const volumeL = skuVolumeLiters(s.skuDimension);
                    const logisticsFee = calcLogisticsFee(volumeL);
                    const netProfitCalc = calculateNetProfit(price, costUzs || 0, commissionPercent, logisticsFee);

                    return (
                      <div key={sid || `sku-${sidx}`} className="rounded-lg bg-[#0f0f16] border border-[#1c1c24] p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] text-[#a1a1aa] font-mono truncate">{multiSku ? (s.skuTitle || sid) : "Tan narx"}</span>
                          <span className="text-[11px] text-[#71717a] flex-shrink-0">Sotuv narxi: <span className="text-white font-semibold">{fmtSom(price)}</span></span>
                        </div>
                        {editing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#10b981] font-semibold">$</span>
                                <input
                                  inputMode="decimal"
                                  value={costs[sid] || ""}
                                  onChange={(e) => {
                                    setCosts((prev) => ({ ...prev, [sid]: fmtUsd(e.target.value) }));
                                  }}
                                  placeholder="Tan narx (USD)"
                                  className="w-full h-9 pl-7 pr-24 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] tabular-nums"
                                />
                                {costUzs != null && costUzs > 0 && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#52525b] font-medium">≈ {fmtSom(costUzs)}</span>
                                )}
                              </div>
                              {margin != null && (
                                <span className={cn("text-xs font-bold w-16 text-right", margin >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>{margin.toFixed(1)}%</span>
                              )}
                            </div>
                            {/* Live preview while editing */}
                            {costUzs && costUzs > 0 && (
                              <div className="rounded bg-[#18181b] p-2 space-y-1 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Sotuv narxi:</span>
                                  <span className="text-white">{fmtSom(price)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Tan narx:</span>
                                  <span className="text-[#10b981]">{fmtCostUsd(costUsd)} <span className="text-[#52525b]">(≈ {fmtSom(costUzs)})</span></span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Uzum komissiya ({commissionPercent}%):</span>
                                  <span className="text-[#f59e0b]">-{fmtSom(netProfitCalc.breakdown.commission)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Logistika {volumeL > 0 ? `(VGT ${volumeL.toFixed(2)} → ${Math.ceil(volumeL)} L)` : "(o'lcham yo'q)"}:</span>
                                  <span className="text-[#f59e0b]">-{fmtSom(netProfitCalc.breakdown.logistics)}</span>
                                </div>
                                <div className="flex justify-between border-t border-[#27272a] pt-1">
                                  <span className="text-[#a1a1aa] font-medium">Sof foyda:</span>
                                  <span className="text-[#10b981] font-bold">{fmtSom(netProfitCalc.netProfit)} ({netProfitCalc.netMargin.toFixed(1)}%)</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              {costUsd != null ? (
                                <span className="text-sm font-bold text-[#10b981]">{fmtCostUsd(costUsd)} <span className="text-[11px] font-normal text-[#52525b]">≈ {fmtSom(costUzs || 0)}</span></span>
                              ) : (
                                <button onClick={() => setEditing(true)} className="text-xs font-medium text-[#f59e0b] hover:underline">Tan narx kiritish</button>
                              )}
                              {margin != null && (
                                <span className={cn("text-xs font-bold", margin >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>Marja {margin.toFixed(1)}%</span>
                              )}
                            </div>
                            {/* Net profit breakdown when not editing */}
                            {costUzs && costUzs > 0 && (
                              <div className="rounded bg-[#0a0a0f] p-2 space-y-1 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Komissiya ({commissionPercent}%):</span>
                                  <span className="text-[#f59e0b]">-{fmtSom(netProfitCalc.breakdown.commission)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#71717a]">Logistika {volumeL > 0 ? `(VGT ${volumeL.toFixed(2)} → ${Math.ceil(volumeL)} L)` : "(o'lcham yo'q)"}:</span>
                                  <span className="text-[#f59e0b]">-{fmtSom(netProfitCalc.breakdown.logistics)}</span>
                                </div>
                                <div className="flex justify-between border-t border-[#27272a] pt-1">
                                  <span className="text-[#a1a1aa]">Sof foyda:</span>
                                  <span className="text-[#10b981] font-bold">{fmtSom(netProfitCalc.netProfit)} ({netProfitCalc.netMargin.toFixed(1)}%)</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Article + XID (product-level) */}
                {editing ? (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <div>
                      <label className="block text-[11px] text-[#71717a] mb-1">Article kod</label>
                      <input value={article} onChange={(e) => setArticle(e.target.value)} placeholder="ART-001"
                        className="w-full h-9 px-3 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] font-mono" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#71717a] mb-1">XID</label>
                      <input value={xid} onChange={(e) => setXid(e.target.value)} placeholder="XID-123"
                        className="w-full h-9 px-3 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] font-mono" />
                    </div>
                  </div>
                ) : (article || xid) ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {article && <div className="rounded-lg bg-[#0f0f16] border border-[#1c1c24] px-3 py-2"><p className="text-[10px] text-[#52525b]">Article</p><p className="text-xs font-mono text-white">{article}</p></div>}
                    {xid && <div className="rounded-lg bg-[#0f0f16] border border-[#1c1c24] px-3 py-2"><p className="text-[10px] text-[#52525b]">XID</p><p className="text-xs font-mono text-white">{xid}</p></div>}
                  </div>
                ) : null}

                {editing && (
                  <div className="flex items-center gap-2 pt-2.5">
                    <button onClick={saveMeta} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] text-white text-xs font-semibold disabled:opacity-60">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Saqlash
                    </button>
                    <button onClick={() => setEditing(false)}
                      className="px-4 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-[#a1a1aa] hover:text-white">
                      Bekor qilish
                    </button>
                  </div>
                )}
              </div>

              <a
                href={`https://uzum.uz/uz/product/${product.productId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#a78bfa] hover:bg-[#8b5cf6]/20 transition-all text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Uzum'da ko'rish
              </a>
            </div>
          </div>
        </motion.div>
      </motion.div>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </AnimatePresence>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sortBy, setSortBy] = useState<SortByOption>("DEFAULT");
  const [order, setOrder] = useState<"ASC" | "DESC">("ASC");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const pageSize = 24;

  // Persist view mode + order
  useEffect(() => {
    const v = localStorage.getItem("products-view");
    if (v === "list" || v === "grid") setView(v);
    const o = localStorage.getItem("products-order");
    if (o === "ASC" || o === "DESC") setOrder(o);
  }, []);
  useEffect(() => { localStorage.setItem("products-view", view); }, [view]);
  useEffect(() => { localStorage.setItem("products-order", order); }, [order]);

  const { data: syncStatus } = useSyncStatus();
  const isConnected = syncStatus?.isConnected;

  // Seller-entered overrides (cost price, article, XID) keyed by skuId
  const { data: metaMap } = useProductMeta();

  // Whether the user is searching. In search mode we fetch a large batch ONCE
  // (no server search) and filter fully client-side so custom Article/XID also
  // match — Uzum's server search only knows name/SKU.
  const searching = search.trim().length > 0;

  // First call: just to get total (size=1 keeps it cheap). No search → real total.
  const { data: meta, isLoading: metaLoading, isError: metaError, refetch: refetchMeta } =
    useLiveProducts({ page: 0, size: 1, filter, sortBy });
  const total = meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Uzum API doesn't honor `order` param — flip pagination client-side for ASC
  const effectivePage = order === "ASC" ? Math.max(0, totalPages - 1 - page) : page;

  // In ASC (default) non-search mode the real page index depends on `total`, so
  // wait for the cheap meta call before fetching the list — this avoids a wasted
  // page-0 request on every visit (which also added rate-limit pressure).
  const needsMeta = !searching && order === "ASC";
  const mainEnabled = !needsMeta || meta !== undefined;

  const { data, isLoading, isFetching, isError, refetch } = useLiveProducts({
    page: searching ? 0 : effectivePage,
    size: searching ? Math.min(2000, Math.max(total, 100)) : pageSize,
    filter,
    sortBy,
  }, mainEnabled);

  const showLoading = (metaLoading && !meta) || isLoading || (!mainEnabled && !metaError);
  const showError = (isError || metaError) && !data;
  const retryAll = () => { refetchMeta(); refetch(); };

  const products = useMemo(() => {
    const list = data?.products || [];
    if (searching) return list; // order handled after filtering
    return order === "ASC" ? [...list].reverse() : list;
  }, [data?.products, order, searching]);

  const allRows = useMemo(() => {
    return products.map((p: any) => {
      const sku = p.skuList?.[0] || {};
      return {
        productId: p.productId,
        skuId: sku.skuId,
        title: p.title || sku.productTitle || "Nomsiz",
        category: p.category || "—",
        image: getImageUrl(p),
        price: sku.price || 0,
        quantityActive: sku.quantityActive ?? p.quantityActive ?? 0,
        quantityFbs: sku.quantityFbs ?? p.quantityFbs ?? 0,
        quantitySold: sku.quantitySold ?? 0,
        quantityReturned: sku.quantityReturned ?? 0,
        statusValue: p.status?.value || "ACTIVE",
        statusTitle: p.status?.title,
        rating: parseFloat(p.rating) || 0,
        feedbackQuantity: p.feedbackQuantity || 0,
        commission: p.commissionDto?.minCommission ?? 0,
        rank: sku.rankInfo?.rank || "N",
        skuCount: p.skuList?.length || 0,
        barcode: sku.barcode,
        skuTitle: sku.skuTitle,
        meta: metaMap?.[sku.skuId],
        _raw: p,
      };
    });
  }, [products, metaMap]);

  // Client-side search across name, SKU, barcode, Article code and XID
  const rows = useMemo(() => {
    if (!searching) return allRows;
    const q = search.trim().toLowerCase();
    return allRows.filter((r: any) =>
      (r.title || "").toLowerCase().includes(q) ||
      String(r.skuId || "").toLowerCase().includes(q) ||
      String(r.productId || "").toLowerCase().includes(q) ||
      (r.skuTitle || "").toLowerCase().includes(q) ||
      String(r.barcode || "").toLowerCase().includes(q) ||
      (r.meta?.articleCode || "").toLowerCase().includes(q) ||
      (r.meta?.xid || "").toLowerCase().includes(q),
    );
  }, [allRows, searching, search]);

  const totalSold = rows.reduce((s, r) => s + r.quantitySold, 0);
  const avgCommission = rows.length
    ? (rows.reduce((s, r) => s + r.commission, 0) / rows.length).toFixed(1)
    : "0";

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mahsulotlar" subtitle="Uzum do'konidagi mahsulotlar" />
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24]">
          <NotConnectedState />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mahsulotlar"
        subtitle={`Uzum do'konidan jonli ma'lumot${total ? ` · Jami ${total} ta` : ""}`}
        action={
          <button
            onClick={retryAll}
            disabled={isFetching || showLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#71717a] hover:text-white hover:border-[#27272a] transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isFetching || showLoading) && "animate-spin")} />
            Yangilash
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Jami mahsulotlar", value: total.toLocaleString(), icon: Package, color: "#8b5cf6" },
          { label: "Sotilgan (sahifada)", value: totalSold.toLocaleString(), icon: ShoppingCart, color: "#10b981" },
          { label: "O'rtacha komissiya", value: `${avgCommission}%`, icon: Percent, color: "#f59e0b" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${card.color}20` }}>
                <Icon className="w-5 h-5" style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-[11px] text-[#52525b] uppercase tracking-wider">{card.label}</p>
                <p className="text-lg font-semibold text-white">{card.value}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Filters + View toggle + Sort */}
      <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Mahsulot nomi yoki SKU bo'yicha qidirish..."
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30"
            />
          </div>

          {/* Sort + Order */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as SortByOption); setPage(0); }}
                className="h-10 pl-9 pr-8 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white appearance-none cursor-pointer hover:border-[#3f3f46] focus:outline-none focus:border-[#8b5cf6]"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#0f0f16]">{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71717a] pointer-events-none" />
            </div>
            <button
              onClick={() => { setOrder((o) => (o === "ASC" ? "DESC" : "ASC")); setPage(0); }}
              className="h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center gap-1.5 text-xs text-white transition-all"
              title={order === "ASC" ? "Oxiridan boshiga (eski → yangi)" : "Boshidan oxiriga (yangi → eski)"}
            >
              {order === "ASC" ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5 text-[#8b5cf6]" />
                  <span className="hidden md:inline">Oxiridan</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-3.5 h-3.5 text-[#8b5cf6]" />
                  <span className="hidden md:inline">Boshidan</span>
                </>
              )}
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[#18181b] border border-[#27272a]">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                view === "grid" ? "bg-[#8b5cf6] text-white" : "text-[#71717a] hover:text-white"
              )}
              title="Setka ko'rinish"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                view === "list" ? "bg-[#8b5cf6] text-white" : "text-[#71717a] hover:text-white"
              )}
              title="Ro'yxat ko'rinish"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#18181b] border border-[#27272a] overflow-x-auto scrollbar-thin">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { setFilter(opt.id); setPage(0); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                filter === opt.id ? "bg-[#8b5cf6] text-white" : "text-[#71717a] hover:text-white"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {showLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
          <p className="text-xs text-[#52525b]">Mahsulotlar yuklanmoqda…</p>
        </div>
      )}

      {/* Error */}
      {!showLoading && showError && (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#ef4444]/25 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-[#ef4444] mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Mahsulotlarni yuklab bo'lmadi</p>
          <p className="text-xs text-[#52525b] mt-1 max-w-sm mx-auto">
            Uzum API javob bermadi yoki so'rovlar cheklovi (rate limit) ishladi. Biroz kutib qayta urinib ko'ring.
          </p>
          <button
            onClick={retryAll}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#a78bfa] hover:bg-[#8b5cf6]/20 text-xs font-medium transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Qayta urinish
          </button>
        </div>
      )}

      {/* Empty */}
      {!showLoading && !showError && rows.length === 0 && (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] py-16 text-center">
          <Package className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Mahsulotlar topilmadi</p>
          <p className="text-xs text-[#52525b] mt-1">Filtr yoki qidiruvni o'zgartirib ko'ring</p>
        </div>
      )}

      {/* Products */}
      {!showLoading && !showError && rows.length > 0 && (
        <div className={cn(
          view === "grid"
            ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3"
            : "space-y-2"
        )}>
          {rows.map((row, i) => (
            <ProductCard
              key={row.productId || `product-${i}`}
              row={row}
              view={view}
              index={i}
              onClick={() => setSelectedProduct(row)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!searching && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[#52525b]">
            Sahifa <span className="text-white font-medium">{page + 1}</span> / {totalPages} · Jami {total} ta
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0f0f16] border border-[#1c1c24] text-xs text-white hover:border-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3 h-3" />
              Oldingi
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1 || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0f0f16] border border-[#1c1c24] text-xs text-white hover:border-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingi
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} metaMap={metaMap} />
    </div>
  );
}
