"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Package, AlertCircle, Loader2, Sparkles,
  ChevronLeft, ChevronRight, ChevronDown, X, Calendar,
  Copy, Check, ExternalLink, MapPin, Clock, Box, Hash, Tag,
  ShoppingBag, Truck, FileText, Phone, User, Printer, Download,
  QrCode, CheckCircle2, ZoomIn, ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useFbsOrders, useFbsOrderCounts, useFbsInvoices, useFbsInvoiceOrders, useConfirmFbsOrder, useCancelFbsOrder, useFbsReturnReasons, useDbsOrderAction, useFbsInvoiceDropOffPoints, useFbsInvoiceTimeSlots, useCreateFbsInvoice } from "@/hooks/use-orders";
import { useSyncStatus } from "@/hooks/use-sync";
import { useAuthStore } from "@/stores/auth-store";
import { useDashboardStore } from "@/stores/dashboard-store";
import { formatMoney, usdToUzs } from "@/lib/currency";
import { printQrLabels, printHtmlDocument, type QrLabelEntry } from "@/lib/qr-print";
import { printInvoiceAct, printInvoiceActPdf } from "@/lib/invoice-act";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

// ─── Picking sheet (Yig'ish varaqasi) ────────────────────────────────────
// Aggregates all order items across a set of orders by SKU, summing quantities,
// then prints a clean table (№ | ID | SKU | NOMI | SONI). Cyrillic-safe (HTML).
function aggregatePickingRows(orders: any[]) {
  const map = new Map<string, { id: string; sku: string; title: string; qty: number }>();
  for (const o of orders) {
    for (const it of (o.orderItems || o.items || [])) {
      const barcode = String(it.barcode || "").trim();
      const sku = it.skuTitle || "";
      const key = barcode || sku || it.title || Math.random().toString();
      const qty = Math.max(1, Number(it.amount || 1));
      const ex = map.get(key);
      if (ex) ex.qty += qty;
      else map.set(key, { id: barcode, sku, title: it.title || "", qty });
    }
  }
  // SKU bo'yicha alifbo tartibida
  return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

function printPickingSheet(orders: any[], heading: string) {
  const rows = aggregatePickingRows(orders);
  if (rows.length === 0) { toast.error("Yig'ish uchun mahsulot topilmadi"); return; }
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const now = new Date().toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
  const body = rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td class="mono">${esc(r.id)}</td>
      <td class="mono b">${esc(r.sku)}</td>
      <td>${esc(r.title)}</td>
      <td class="c qty">${r.qty}</td>
    </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Yig'ish varaqasi</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color:#111; margin:24px; }
    h1 { font-size:18px; margin:0 0 2px; }
    .sub { font-size:12px; color:#555; margin:0 0 14px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { border:1px solid #bbb; padding:7px 9px; text-align:left; vertical-align:middle; }
    th { background:#f0f0f0; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
    .c { text-align:center; }
    .mono { font-family:"Consolas",monospace; }
    .b { font-weight:700; }
    .qty { font-weight:800; font-size:15px; }
    tbody tr:nth-child(even) { background:#fafafa; }
    tfoot td { font-weight:800; background:#f0f0f0; }
    @media print { body { margin:10mm; } }
  </style></head><body>
    <h1>Yig'ish varaqasi — ${esc(heading)}</h1>
    <p class="sub">${now} · ${rows.length} xil mahsulot · jami ${totalQty} dona</p>
    <table>
      <thead><tr><th class="c">№</th><th>ID (shtrix-kod)</th><th>SKU</th><th>Nomi</th><th class="c">Soni</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right">JAMI</td><td class="c">${totalQty}</td></tr></tfoot>
    </table>
  </body></html>`;
  printHtmlDocument(html);
}

// Aggregate order items into QR label entries by barcode (counts summed).
// printQrLabels groups & sorts by SKU, so same-SKU labels print consecutively.
// Works for both FBS list orders (orderItems) and invoice orders (items).
function itemsToQrEntries(orders: any[]): QrLabelEntry[] {
  const map = new Map<string, QrLabelEntry>();
  for (const o of orders) {
    for (const it of (o.orderItems || o.items || [])) {
      const barcode = String(it.barcode || "").trim();
      if (!barcode) continue;
      const qty = Math.max(1, Number(it.amount || 1));
      const ex = map.get(barcode);
      if (ex) ex.count! += qty;
      else map.set(barcode, { barcode, skuTitle: it.skuTitle || "", title: it.title || "", count: qty });
    }
  }
  return Array.from(map.values());
}

// ─── Yuborish dalolatnomasi (qabul-topshirish akti) ──────────────────────
// Buyurtmada faqat invoiceNumber bor — raqam bo'yicha ta'minlashni qidirib
// (oxirgi ~100 ta ichidan), buyurtmalarini olib, A4 akt chop etamiz.
function useSellerName(): string | undefined {
  const storeId = useAuthStore((s) => s.activeStoreId);
  const user = useAuthStore((s) => s.user);
  return user?.stores?.find((st) => st.id === storeId)?.name;
}

function usePrintInvoiceAct() {
  const [loading, setLoading] = useState(false);
  const storeId = useAuthStore((s) => s.activeStoreId);
  const sellerName = useSellerName();

  const printAct = async (invoiceNumber: string | number) => {
    if (!storeId || loading) return;
    setLoading(true);
    try {
      let invoice: any = null;
      for (let page = 0; page < 5 && !invoice; page++) {
        const { data } = await apiClient.get(
          `/marketplace/stores/${storeId}/fbs/invoices`,
          { params: { page, size: 20 } },
        );
        const list = data?.invoices || [];
        invoice = list.find((inv: any) => String(inv.number) === String(invoiceNumber)) || null;
        if (list.length < 20) break;
      }
      if (!invoice) {
        toast.error(`Ta'minlash №${invoiceNumber} topilmadi`);
        return;
      }
      // Avval Uzum'ning rasmiy PDF aktini ochamiz; bo'lmasa HTML'ga o'tamiz
      const ok = await printInvoiceActPdf(storeId, invoice.id, "act");
      if (ok) {
        toast.success("Dalolatnoma ochildi");
        return;
      }
      const { data: od } = await apiClient.get(
        `/marketplace/stores/${storeId}/fbs/invoices/${invoice.id}/orders`,
      );
      await printInvoiceAct(invoice, od?.orders || [], { sellerName });
      toast.success("Dalolatnoma chop etishga yuborildi");
    } catch (err: any) {
      toast.error(`Dalolatnomani chiqarib bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setLoading(false);
    }
  };

  return { printAct, loading };
}

// Fast client-side QR printing — uses already-loaded order items (no backend round-trip).
function usePrintQrFast() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const run = async (orders: any[]) => {
    const entries = itemsToQrEntries(orders);
    if (entries.length === 0) { toast.error("Mahsulot barcodelari topilmadi"); return; }
    setLoading(true);
    setProgress({ done: 0, total: entries.length });
    try {
      const n = await printQrLabels(entries, (done, total) => setProgress({ done, total }));
      toast.success(`${n} ta QR kod chop etishga yuborildi`);
    } catch (err: any) {
      toast.error(`QR kodlarni chiqarib bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setLoading(false);
    }
  };
  return { run, isLoading: loading, progress };
}

// ─── Status mapping (Uzum tab labels) ────────────────────────────────────
type Status =
  | "CREATED" | "PACKING" | "PENDING_DELIVERY" | "DELIVERING"
  | "DELIVERED" | "ACCEPTED_AT_DP" | "DELIVERED_TO_CUSTOMER_DELIVERY_POINT"
  | "COMPLETED" | "CANCELED" | "PENDING_CANCELLATION" | "RETURNED";

interface TabConfig {
  id: string;            // unique tab id (e.g. "ACCEPTED")
  primary: Status;       // status used for fetching orders
  statuses: Status[];    // statuses included in count badge
  label: string;
  color: string;
  bg: string;
}

const tabs: TabConfig[] = [
  { id: "CREATED",   primary: "CREATED",   statuses: ["CREATED"],            label: "Yangilar",            color: "#a78bfa", bg: "#8b5cf6" },
  { id: "PACKING",   primary: "PACKING",   statuses: ["PACKING"],            label: "Yig'ishdagilar",      color: "#a1a1aa", bg: "#27272a" },
  { id: "PREPARING", primary: "PENDING_DELIVERY", statuses: ["PENDING_DELIVERY"], label: "Ta'minlashda",  color: "#a1a1aa", bg: "#27272a" },
  { id: "ACCEPTED",  primary: "ACCEPTED_AT_DP",   statuses: ["DELIVERING", "ACCEPTED_AT_DP"], label: "Uzum qabul qilgan", color: "#a1a1aa", bg: "#27272a" },
  { id: "PENDING",   primary: "DELIVERED_TO_CUSTOMER_DELIVERY_POINT", statuses: ["DELIVERED_TO_CUSTOMER_DELIVERY_POINT"], label: "Topshirishni kutyapti", color: "#a1a1aa", bg: "#27272a" },
  { id: "DONE",      primary: "COMPLETED", statuses: ["COMPLETED"],          label: "Topshirilganlar",     color: "#10b981", bg: "rgba(16,185,129,.18)" },
  { id: "CANCELED",  primary: "CANCELED",  statuses: ["CANCELED", "PENDING_CANCELLATION"], label: "Bekor qilinganlar", color: "#ef4444", bg: "rgba(239,68,68,.18)" },
  { id: "RETURNED",  primary: "RETURNED",  statuses: ["RETURNED"],           label: "Qaytarishlar",        color: "#f59e0b", bg: "rgba(245,158,11,.18)" },
];

const statusBadgeConfig: Record<string, { label: string; color: string; bg: string }> = {
  CREATED:                              { label: "Yangi",              color: "#a78bfa", bg: "rgba(139,92,246,.15)" },
  PACKING:                              { label: "Yig'ilmoqda",        color: "#3b82f6", bg: "rgba(59,130,246,.15)" },
  PENDING_DELIVERY:                     { label: "Ta'minlashda",       color: "#06b6d4", bg: "rgba(6,182,212,.15)" },
  DELIVERING:                           { label: "Yo'lda",             color: "#06b6d4", bg: "rgba(6,182,212,.15)" },
  DELIVERED:                            { label: "Yetkazilgan",        color: "#10b981", bg: "rgba(16,185,129,.15)" },
  ACCEPTED_AT_DP:                       { label: "PP qabul qilgan",    color: "#10b981", bg: "rgba(16,185,129,.15)" },
  DELIVERED_TO_CUSTOMER_DELIVERY_POINT: { label: "Topshirilishi kutilmoqda", color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
  COMPLETED:                            { label: "Topshirilgan",       color: "#10b981", bg: "rgba(16,185,129,.15)" },
  CANCELED:                             { label: "Bekor qilingan",     color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  PENDING_CANCELLATION:                 { label: "Bekor qilinmoqda",   color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  RETURNED:                             { label: "Qaytarilgan",        color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
};

// Oddiy kundalik format: "05.06.2026 14:30" (lokaldan mustaqil, hamma joyda bir xil)
const pad2 = (n: number) => String(n).padStart(2, "0");
function formatDate(ms?: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Sana + vaqt oralig'i (ta'minlash vaqti slotlari uchun): "05.06.2026 14:30 – 16:00"
function fmtSlot(fromMs?: number | null, toMs?: number | null): string {
  if (!fromMs) return "—";
  const f = new Date(fromMs);
  if (isNaN(f.getTime())) return "—";
  const base = `${pad2(f.getDate())}.${pad2(f.getMonth() + 1)}.${f.getFullYear()} ${pad2(f.getHours())}:${pad2(f.getMinutes())}`;
  if (!toMs) return base;
  const t = new Date(toMs);
  if (isNaN(t.getTime())) return base;
  return `${base} – ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

/** To'liq summa (qisqartmasdan), minglik ajratgich bilan: 1 243 275 so'm. */
function fmtSom(n?: number | null): string {
  return `${new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0))} so'm`;
}

function getDropOffUuid(point: any): string {
  return String(point?.uuid ?? point?.id ?? point?.dropOffPointUuid ?? point?.dopId ?? "");
}

function getDropOffLabel(point: any): string {
  return point?.address || point?.name || point?.title || point?.stock?.title || getDropOffUuid(point);
}

function getTimeSlotUuid(slot: any): string {
  return String(slot?.uuid ?? slot?.id ?? slot?.timeSlotUuid ?? "");
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getOrderDeadline(order: any): number | null {
  const value = order?.deliveryDate ?? order?.deliveryDateTime ?? order?.shipmentDate ?? order?.shipmentDateTime;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isOrderDueOn(order: any, dayOffset: number): boolean {
  const deadline = getOrderDeadline(order);
  if (!deadline) return false;
  const target = startOfLocalDay(addLocalDays(new Date(), dayOffset));
  return startOfLocalDay(new Date(deadline)) === target;
}

function shortDateLabel(ms?: number | null): string {
  if (!ms) return "Sana yo'q";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "Sana yo'q";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function shortTimeRange(fromMs?: number | null, toMs?: number | null): string {
  if (!fromMs) return "Vaqt yo'q";
  const f = new Date(fromMs);
  if (isNaN(f.getTime())) return "Vaqt yo'q";
  const from = `${pad2(f.getHours())}:${pad2(f.getMinutes())}`;
  if (!toMs) return from;
  const t = new Date(toMs);
  if (isNaN(t.getTime())) return from;
  return `${from} - ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

function CopyableId({ value, label }: { value: string | number; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] transition-all"
      title={`Nusxa olish: ${value}`}
    >
      {label && <span className="text-[10px] uppercase tracking-wider text-[#71717a] font-semibold">{label}</span>}
      <span className="text-xs font-mono text-[#e4e4e7] font-medium">{value}</span>
      {copied ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5 text-[#52525b] group-hover:text-[#a1a1aa]" />}
    </button>
  );
}

function NotConnectedState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[#3f3f46]" />
      </div>
      <p className="text-sm font-semibold text-white mb-1">Uzum API ulanmagan</p>
      <p className="text-xs text-[#52525b] mb-4 max-w-xs">Buyurtmalarni ko'rish uchun Uzum do'koningizni ulang</p>
      <Link href="/settings" className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        API ulash
      </Link>
    </div>
  );
}

// ─── Hidden iframe printer ─────────────────────────────────────────────
function printPdfBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    document.body.appendChild(iframe);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { document.body.removeChild(iframe); } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); resolve(); return; }
        win.focus();
        win.print();
        // Some browsers fire afterprint, others don't — fallback timeout
        const onAfter = () => { cleanup(); resolve(); };
        win.addEventListener("afterprint", onAfter, { once: true });
        setTimeout(() => { cleanup(); resolve(); }, 60_000);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    iframe.onerror = () => { cleanup(); reject(new Error("iframe load failed")); };
  });
}

// Hook for fetching label PDFs with stored token
function usePrintLabel() {
  const [loading, setLoading] = useState<Set<string | number>>(new Set());
  const storeId = useAuthStore((s) => s.activeStoreId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const printLabel = async (orderId: string | number) => {
    if (!storeId || !accessToken) return;
    setLoading((prev) => new Set(prev).add(orderId));
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/marketplace/stores/${storeId}/fbs/orders/${orderId}/label?size=LARGE`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await printPdfBlob(blob);
    } catch (err: any) {
      toast.error(`Etiketka yuklab bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  };

  return { printLabel, isLoading: (id: string | number) => loading.has(id) };
}

// Hook for fetching & printing multiple labels at once (merged into one PDF)
function usePrintBatchLabels() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const storeId = useAuthStore((s) => s.activeStoreId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const printBatch = async (orderIds: (string | number)[]) => {
    if (!storeId || !accessToken || orderIds.length === 0) return;
    setLoading(true);
    setProgress({ done: 0, total: orderIds.length });
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/marketplace/stores/${storeId}/fbs/labels/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderIds, size: "LARGE" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { results: Array<{ orderId: number; ok: boolean; document?: string }> } = await res.json();
      const successful = data.results.filter((r) => r.ok && r.document);
      setProgress({ done: successful.length, total: orderIds.length });

      if (successful.length === 0) {
        toast.error("Etiketkalar yuklab olinmadi");
        return;
      }

      // Merge all PDFs into one using pdf-lib
      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      for (const r of successful) {
        try {
          const bytes = Uint8Array.from(atob(r.document!), (c) => c.charCodeAt(0));
          const src = await PDFDocument.load(bytes);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
        } catch (e) {
          console.warn(`Skipped order ${r.orderId} due to PDF parse error`);
        }
      }

      const mergedBytes = await merged.save();
      const blob = new Blob([mergedBytes as unknown as ArrayBuffer], { type: "application/pdf" });
      await printPdfBlob(blob);

      const failed = orderIds.length - successful.length;
      if (failed > 0) {
        toast.warning(`${successful.length} etiketka chop etishga yuborildi, ${failed} tasi yuklab olinmadi`);
      } else {
        toast.success(`${successful.length} ta etiketka chop etishga yuborildi`);
      }
    } catch (err: any) {
      toast.error(`Etiketkalarni yuklab bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setLoading(false);
    }
  };

  return { printBatch, isLoading: loading, progress };
}

// Hook for fetching barcodes and generating QR code printable PDF
function usePrintQrCodes() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const storeId = useAuthStore((s) => s.activeStoreId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const printQrCodes = async (orderIds: (string | number)[]) => {
    if (!storeId || !accessToken || orderIds.length === 0) return;
    setLoading(true);
    setProgress({ done: 0, total: orderIds.length });
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/marketplace/stores/${storeId}/fbs/barcodes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ orderIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { items: Array<{ orderId: number; itemId: number; barcode: string; skuTitle: string; title: string; amount: number }>; failedOrders?: number } = await res.json();
      const items = data.items || [];
      if (items.length === 0) {
        toast.error("Mahsulot barcodelari topilmadi");
        return;
      }
      if (data.failedOrders && data.failedOrders > 0) {
        toast.warning(`${data.failedOrders} ta buyurtmadan ma'lumot olib bo'lmadi (rate limit)`);
      }

      // Flatten: 5 quantity → 5 QR codes
      const flat: Array<{ barcode: string; skuTitle: string; title: string }> = [];
      items.forEach((it) => {
        for (let i = 0; i < it.amount; i++) {
          flat.push({ barcode: it.barcode, skuTitle: it.skuTitle, title: it.title });
        }
      });
      setProgress({ done: 0, total: flat.length });

      // Build QR module matrices (vector data — no raster blur on print)
      const QRCode = (await import("qrcode")).default;
      const qrMatrices = flat.map((entry, idx) => {
        const qr = QRCode.create(entry.barcode, { errorCorrectionLevel: "M" });
        setProgress({ done: idx + 1, total: flat.length });
        return { ...entry, qr };
      });

      // Build PDF — one label per page (40×30mm Xprinter label, horizontal)
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

      // 40mm (width) × 30mm (height) in points (1mm = 2.83465pt)
      const W = 40 * 2.83465;
      const H = 30 * 2.83465;

      const toAscii = (s: string) =>
        (s || "").replace(/[^\x20-\x7E]/g, "").replace(/[-\s]+$/, "").trim();

      // Fit a font size so the rotated text stays within `maxLen` along the label height
      const fitFontSize = (text: string, maxLen: number, desired: number, f: typeof font, minSize = 4) => {
        let size = desired;
        while (size > minSize && f.widthOfTextAtSize(text, size) > maxLen) {
          size -= 0.5;
        }
        return size;
      };

      // Render text rotated 90° CCW onto a canvas, return PNG bytes + PDF dimensions.
      // Used for SKU titles which may contain Cyrillic/Unicode (Helvetica WinAnsi can't render those).
      const renderVerticalTextPng = (text: string, fontPx: number, scale = 4) => {
        const fontFamily = '"Segoe UI", system-ui, -apple-system, "Noto Sans", Arial, sans-serif';
        const cssFont = `bold ${fontPx * scale}px ${fontFamily}`;

        const meas = document.createElement("canvas").getContext("2d");
        if (!meas) throw new Error("Canvas 2D context unavailable");
        meas.font = cssFont;
        const textWPx = Math.ceil(meas.measureText(text).width);
        const textHPx = Math.ceil(fontPx * scale * 1.25);

        const canvas = document.createElement("canvas");
        canvas.width = textHPx; // narrow side (strip width after rotation)
        canvas.height = textWPx; // long side (strip height after rotation)
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#000";
        ctx.font = cssFont;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(text, 0, 0);

        const dataUrl = canvas.toDataURL("image/png");
        const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
        return { bytes, widthPt: textHPx / scale, heightPt: textWPx / scale };
      };

      for (const entry of qrMatrices) {
        const page = pdf.addPage([W, H]);

        const safeBarcode = toAscii(entry.barcode);
        // Keep Unicode (Cyrillic etc.) — only strip control chars and trailing punctuation
        const safeSkuTitle = (entry.skuTitle || "")
          .replace(/[\x00-\x1F\x7F]/g, "")
          .replace(/[\s-]+$/, "")
          .trim();
        const last4Digits = safeBarcode.slice(-4);
        const restBarcode = safeBarcode.slice(0, -4);

        // QR code centered, smaller so side text has more room
        const qrSize = H * 0.78;
        const qrX = (W - qrSize) / 2;
        const qrY = (H - qrSize) / 2;

        // Draw QR as vector rectangles (crisp at any DPI, no raster blur)
        const modulesSize = entry.qr.modules.size;
        const modulesData = entry.qr.modules.data;
        const moduleSize = qrSize / modulesSize;
        const overlap = 0.05; // tiny overlap to avoid hairline seams between modules
        for (let row = 0; row < modulesSize; row++) {
          for (let col = 0; col < modulesSize; col++) {
            if (modulesData[row * modulesSize + col]) {
              page.drawRectangle({
                x: qrX + col * moduleSize,
                y: qrY + qrSize - (row + 1) * moduleSize,
                width: moduleSize + overlap,
                height: moduleSize + overlap,
                color: rgb(0, 0, 0),
              });
            }
          }
        }

        const verticalMargin = 4;
        const maxVertical = H - verticalMargin * 2;

        // Visual offset to compensate for rotated text baseline (text sits below anchor visually)
        const sideTextLift = 2.5;

        // Left side: SKU title rotated 90° CCW — rendered via canvas PNG so Cyrillic / Unicode works
        if (safeSkuTitle) {
          let skuFontPx = 11;
          let strip = renderVerticalTextPng(safeSkuTitle, skuFontPx);
          while (strip.heightPt > maxVertical && skuFontPx > 5) {
            skuFontPx -= 0.5;
            strip = renderVerticalTextPng(safeSkuTitle, skuFontPx);
          }
          const skuImg = await pdf.embedPng(strip.bytes);
          page.drawImage(skuImg, {
            x: qrX - strip.widthPt,
            y: (H - strip.heightPt) / 2 + sideTextLift,
            width: strip.widthPt,
            height: strip.heightPt,
          });
        }

        // Right side: barcode rotated 90° CCW (reads bottom-to-top, matches left side)
        // Order: rest at bottom (start of barcode), last 4 at top (larger & bold)
        if (safeBarcode) {
          const gap = 2;
          const lastFontSize = fitFontSize(last4Digits, maxVertical * 0.4, 14, boldFont);
          const lastWidth = boldFont.widthOfTextAtSize(last4Digits, lastFontSize);
          const restFontSize = restBarcode
            ? fitFontSize(restBarcode, maxVertical - lastWidth - gap, 12, boldFont)
            : 0;
          const restWidth = restBarcode ? boldFont.widthOfTextAtSize(restBarcode, restFontSize) : 0;
          const totalWidth = restWidth + (restBarcode ? gap : 0) + lastWidth;
          const bottomY = (H - totalWidth) / 2 + sideTextLift + 3;
          const anchorX = W - 2;

          if (restBarcode) {
            page.drawText(restBarcode, {
              x: anchorX,
              y: bottomY,
              size: restFontSize,
              font: boldFont,
              color: rgb(0, 0, 0),
              rotate: degrees(90),
            });
          }

          page.drawText(last4Digits, {
            x: anchorX,
            y: bottomY + restWidth + (restBarcode ? gap : 0),
            size: lastFontSize,
            font: boldFont,
            color: rgb(0, 0, 0),
            rotate: degrees(90),
          });
        }
      }

      const bytes = await pdf.save();
      const blob = new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
      await printPdfBlob(blob);
      toast.success(`${flat.length} ta QR kod chop etishga yuborildi`);
    } catch (err: any) {
      toast.error(`QR kodlarni yuklab bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setLoading(false);
    }
  };

  return { printQrCodes, isLoading: loading, progress };
}

function PrintLabelButton({ orderId, compact = false }: { orderId: string | number; compact?: boolean }) {
  const { printLabel, isLoading } = usePrintLabel();
  const loading = isLoading(orderId);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); printLabel(orderId); }}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 border border-[#8b5cf6]/30 hover:border-[#8b5cf6]/50 text-[#a78bfa] font-medium transition-all disabled:opacity-50",
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      )}
      title="Etiketkani PDF qilib yuklab olish"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
      Etiketka
    </button>
  );
}

function ConfirmOrderButton({ orderId, compact = false }: { orderId: string | number; compact?: boolean }) {
  const confirmMutation = useConfirmFbsOrder();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); confirmMutation.mutate(orderId); }}
      disabled={confirmMutation.isPending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-[#10b981]/15 hover:bg-[#10b981]/25 border border-[#10b981]/30 hover:border-[#10b981]/50 text-[#10b981] font-medium transition-all disabled:opacity-50",
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      )}
      title="Buyurtmani tasdiqlash"
    >
      {confirmMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      Tasdiqlash
    </button>
  );
}

const CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: "Mahsulot tugagan",
  OUT_OF_PACKAGE: "Qadoqlash imkoni yo'q",
  OUT_OF_TIME: "Vaqt o'tib ketgan",
  OTHER: "Boshqa sabab",
  ACCEPTANCE_TIME_EXPIRED: "Qabul vaqti o'tgan",
  DELIVERY_TIME_EXPIRED: "Yetkazish vaqti o'tgan",
};

function CancelOrderButton({ orderId, onDone }: { orderId: string | number; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const { data: reasons } = useFbsReturnReasons();
  const cancelMutation = useCancelFbsOrder();

  const list = (reasons?.length ? reasons.map((r) => r.reason) : ["OUT_OF_STOCK", "OUT_OF_PACKAGE", "OUT_OF_TIME", "OTHER"]);

  const submit = () => {
    if (!reason) { toast.error("Sababni tanlang"); return; }
    cancelMutation.mutate(
      { orderId, reason, comment: comment.trim() || undefined },
      { onSuccess: (d) => { if (d.ok) { setOpen(false); onDone?.(); } } },
    );
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#ef4444]/12 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 hover:border-[#ef4444]/50 text-[#ef4444] font-medium transition-all px-3 py-1.5 text-xs"
        title="Buyurtmani bekor qilish"
      >
        <X className="w-3.5 h-3.5" />
        Bekor qilish
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-[#0f0f16] border border-[#ef4444]/30 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-[#ef4444]">Bekor qilish sababi</p>
      <div className="grid grid-cols-2 gap-1.5">
        {list.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all border",
              reason === r
                ? "bg-[#ef4444]/15 border-[#ef4444]/50 text-[#ef4444]"
                : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#3f3f46]"
            )}
          >
            {CANCEL_REASON_LABELS[r] || r}
          </button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Izoh (ixtiyoriy)"
        className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:outline-none focus:border-[#ef4444]/50 placeholder:text-[#52525b]"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={cancelMutation.isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-br from-[#ef4444] to-[#dc2626] hover:from-[#f87171] hover:to-[#ef4444] text-white text-xs font-semibold transition-all disabled:opacity-60"
        >
          {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Tasdiqlab bekor qilish
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs hover:border-[#3f3f46]"
        >
          Yopish
        </button>
      </div>
    </div>
  );
}

/** DBS buyurtma hayot-sikli amallari: yetkazish → topshirish → qaytarish */
function DbsActions({ order, onDone }: { order: any; onDone?: () => void }) {
  const dbs = useDbsOrderAction();
  const [issueCode, setIssueCode] = useState("");

  const run = (action: "delivering" | "completed" | "refund") =>
    dbs.mutate(
      { orderId: order.id, action, issueCode: action === "completed" && issueCode ? Number(issueCode) : undefined },
      { onSuccess: (d) => { if (d.ok && action !== "delivering") onDone?.(); } },
    );

  const btn = "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60";

  return (
    <div className="rounded-xl bg-[#0f0f16] border border-[#06b6d4]/25 p-3 space-y-2">
      <p className="text-xs font-semibold text-[#06b6d4]">DBS yetkazib berish</p>
      <div className="flex flex-wrap gap-2">
        {order.status === "PACKING" && (
          <button onClick={() => run("delivering")} disabled={dbs.isPending}
            className={cn(btn, "bg-[#3b82f6]/15 border border-[#3b82f6]/30 text-[#3b82f6]")}>
            {dbs.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
            Yetkazishga berish
          </button>
        )}
        {order.status === "DELIVERING" && (
          <>
            <input
              value={issueCode}
              onChange={(e) => setIssueCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Tasdiq kodi (agar bo'lsa)"
              inputMode="numeric"
              className="px-2.5 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:outline-none focus:border-[#10b981]/50 placeholder:text-[#52525b] w-[170px]"
            />
            <button onClick={() => run("completed")} disabled={dbs.isPending}
              className={cn(btn, "bg-[#10b981]/15 border border-[#10b981]/30 text-[#10b981]")}>
              {dbs.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Topshirildi
            </button>
          </>
        )}
        {order.status === "COMPLETED" && (
          <button onClick={() => run("refund")} disabled={dbs.isPending}
            className={cn(btn, "bg-[#ef4444]/12 border border-[#ef4444]/30 text-[#ef4444]")}>
            {dbs.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Qaytarish yaratish
          </button>
        )}
      </div>
    </div>
  );
}

function CreateInvoiceModal({
  open,
  orders,
  onClose,
  onCreated,
}: {
  open: boolean;
  orders: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const orderIds = useMemo(() => orders.map((o) => o.id).filter(Boolean), [orders]);
  const [dropOffUuid, setDropOffUuid] = useState("");
  const [timeSlotUuid, setTimeSlotUuid] = useState("");
  const [pointSearch, setPointSearch] = useState("");
  const [onlyCompatible, setOnlyCompatible] = useState(true);
  const dropOffQuery = useFbsInvoiceDropOffPoints(orderIds, open);
  const timeSlotQuery = useFbsInvoiceTimeSlots(dropOffUuid || null, orderIds, open);
  const createInvoice = useCreateFbsInvoice();

  useEffect(() => {
    setDropOffUuid("");
    setTimeSlotUuid("");
  }, [open, orderIds.join(",")]);

  useEffect(() => {
    const first = dropOffQuery.data?.[0];
    if (!dropOffUuid && first) setDropOffUuid(getDropOffUuid(first));
  }, [dropOffQuery.data, dropOffUuid]);

  useEffect(() => {
    setTimeSlotUuid("");
  }, [dropOffUuid]);

  useEffect(() => {
    const first = timeSlotQuery.data?.[0];
    if (!timeSlotUuid && first) setTimeSlotUuid(getTimeSlotUuid(first));
  }, [timeSlotQuery.data, timeSlotUuid]);

  const dropOffPoints = useMemo(() => {
    const query = pointSearch.trim().toLowerCase();
    return (dropOffQuery.data || []).filter((point) => {
      if (onlyCompatible && point?.isSuitable === false) return false;
      if (!query) return true;
      return getDropOffLabel(point).toLowerCase().includes(query);
    });
  }, [dropOffQuery.data, onlyCompatible, pointSearch]);
  const selectedPoint = dropOffPoints.find((point) => getDropOffUuid(point) === dropOffUuid)
    || (dropOffQuery.data || []).find((point) => getDropOffUuid(point) === dropOffUuid);
  const groupedSlots = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const slot of timeSlotQuery.data || []) {
      const key = shortDateLabel(slot?.timeFrom);
      map.set(key, [...(map.get(key) || []), slot]);
    }
    return Array.from(map.entries());
  }, [timeSlotQuery.data]);

  if (!open) return null;

  const totalQty = orders.reduce(
    (sum, order) => sum + (order.orderItems || []).reduce((n: number, item: any) => n + (Number(item.amount) || 1), 0),
    0,
  );
  const totalValue = orders.reduce((sum, order) => sum + (Number(order.price) || 0), 0);
  const canCreate = orderIds.length > 0 && dropOffUuid && timeSlotUuid && !createInvoice.isPending;

  const submit = () => {
    if (!canCreate) {
      toast.error("Qabul punkti va vaqt oralig'ini tanlang");
      return;
    }
    createInvoice.mutate(
      { orderIds, dropOffPointUuid: dropOffUuid, timeSlotUuid },
      { onSuccess: (data) => { if (data.ok) { onCreated(); onClose(); } } },
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-5xl max-h-[92dvh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[#f8fafc] text-[#111827] border border-[#e5e7eb] shadow-2xl"
        >
          <div className="bg-white border-b border-[#e5e7eb] p-4 sm:p-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[#111827]">Yangi ta'minlash</p>
              <p className="text-xs text-[#71717a] mt-0.5">{orderIds.length} buyurtma · {totalQty} dona mahsulot · {formatCurrency(totalValue)}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center">
              <X className="w-4 h-4 text-[#4b5563]" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] min-h-[520px] max-h-[calc(92dvh-138px)]">
            <div className="bg-white border-r border-[#e5e7eb] p-4 overflow-y-auto scrollbar-thin">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-[#d1d5db] px-3 py-2.5 mb-3">
                <span className="flex items-center gap-2 text-sm text-[#374151]">
                  <span className={cn("w-10 h-6 rounded-full p-0.5 transition-colors", onlyCompatible ? "bg-[#111827]" : "bg-[#d1d5db]")}>
                    <span className={cn("block w-5 h-5 rounded-full bg-white transition-transform", onlyCompatible && "translate-x-4")} />
                  </span>
                  Faqat moslarini ko'rish
                </span>
                <AlertCircle className="w-4 h-4 text-[#9ca3af]" />
                <input type="checkbox" checked={onlyCompatible} onChange={(e) => setOnlyCompatible(e.target.checked)} className="sr-only" />
              </label>

              <div className="relative mb-4">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  value={pointSearch}
                  onChange={(e) => setPointSearch(e.target.value)}
                  placeholder="Shahar, tuman yoki ko'chani kiriting"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#f3f4f6] border border-transparent text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#8b5cf6] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-semibold text-[#111827]">{dropOffPoints.length} ta qabul qilish joylari</p>
                <p className="text-xs text-[#6b7280]">{orderIds.length} ta tanlangan</p>
              </div>

              {dropOffQuery.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[#f3f4f6] animate-pulse" />)}
                </div>
              ) : !dropOffPoints.length ? (
                <div className="rounded-xl bg-[#fff7ed] border border-[#fed7aa] p-4 text-sm text-[#9a3412]">
                  Bu buyurtmalar uchun mos qabul punkti topilmadi.
                </div>
              ) : (
                <div className="divide-y divide-[#e5e7eb]">
                  {dropOffPoints.map((point, index) => {
                    const uuid = getDropOffUuid(point);
                    const active = uuid === dropOffUuid;
                    return (
                      <button
                        key={uuid || index}
                        onClick={() => setDropOffUuid(uuid)}
                        className={cn("w-full text-left p-4 transition-colors", active ? "bg-[#f3f0ff] rounded-xl ring-1 ring-[#8b5cf6]/30" : "hover:bg-[#f9fafb]")}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center", active ? "border-[#7c3aed] bg-[#7c3aed]" : "border-[#d1d5db]")}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#111827] leading-snug">{getDropOffLabel(point)}</span>
                            <span className="block text-xs text-[#6b7280] mt-1">{point?.type || point?.kind || "Qabul qilish punkti"}</span>
                            <span className="block text-xs text-[#374151] mt-1">{point?.workTime || point?.schedule || "Har kuni 11:00 - 16:00"}</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-[#f8fafc] p-4 sm:p-5 overflow-y-auto scrollbar-thin">
              <div className="rounded-2xl bg-white border border-[#e5e7eb] p-4 mb-4">
                <p className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold mb-2">Tanlangan buyurtmalar</p>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto scrollbar-thin">
                  {orders.map((order) => (
                    <span key={order.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#f3f4f6] text-xs font-mono text-[#374151]">
                      <Hash className="w-3 h-3 text-[#9ca3af]" />
                      {order.publicId || order.id}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-[#e5e7eb] p-4 min-h-[320px]">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-base font-semibold text-[#111827]">Ta'minlash vaqtini tanlang <span className="text-[#ef4444]">*</span></p>
                    {selectedPoint && <p className="text-xs text-[#6b7280] mt-1 line-clamp-1">{getDropOffLabel(selectedPoint)}</p>}
                  </div>
                  {timeSlotQuery.isFetching && <Loader2 className="w-4 h-4 text-[#7c3aed] animate-spin" />}
                </div>

                {!dropOffUuid ? (
                  <div className="h-64 flex items-center justify-center text-center text-sm text-[#9ca3af]">
                    Ta'minlash uchun bo'sh sana va vaqtni ko'rish uchun qabul qilish punktini tanlang
                  </div>
                ) : timeSlotQuery.isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-[#f3f4f6] animate-pulse" />)}
                  </div>
                ) : !groupedSlots.length ? (
                  <div className="h-64 flex items-center justify-center text-center text-sm text-[#9ca3af]">
                    Bu punkt uchun bo'sh time-slot topilmadi
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedSlots.map(([dateLabel, slots]) => (
                      <div key={dateLabel}>
                        <div className="flex items-center justify-between text-sm font-semibold text-[#111827] pb-2 border-b border-[#e5e7eb]">
                          <span>{dateLabel}</span>
                          <span className="text-xs text-[#374151]">Yuborish mumkin</span>
                        </div>
                        <div className="divide-y divide-[#f3f4f6]">
                          {slots.map((slot) => {
                            const uuid = getTimeSlotUuid(slot);
                            const active = uuid === timeSlotUuid;
                            const amount = slot?.amount ?? slot?.availableOrders ?? slot?.limit ?? null;
                            return (
                              <button key={uuid} onClick={() => setTimeSlotUuid(uuid)} className="w-full flex items-center justify-between gap-3 py-3 text-left">
                                <span className="flex items-center gap-3">
                                  <span className={cn("w-5 h-5 rounded-full border flex items-center justify-center", active ? "border-[#7c3aed] bg-[#7c3aed]" : "border-[#d1d5db]")}>
                                    {active && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                  <span className="text-sm text-[#111827]">{shortTimeRange(slot?.timeFrom, slot?.timeTo)}</span>
                                </span>
                                {amount != null && (
                                  <span className="min-w-8 h-6 px-2 rounded-full bg-[#bbf7d0] text-[#166534] text-xs font-bold flex items-center justify-center">
                                    {amount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border-t border-[#e5e7eb] p-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-[#f3f4f6] text-sm font-semibold text-[#374151] hover:bg-[#e5e7eb]">
              Bekor qilish
            </button>
            <button
              onClick={submit}
              disabled={!canCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-semibold disabled:opacity-50"
            >
              {createInvoice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Yaratish va ta'minlashga o'tish
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function OrderRow({
  order,
  onClick,
  index,
  showPrintLabel,
  showConfirm,
  selectable,
  selected,
  onSelectionChange,
}: {
  order: any;
  onClick: () => void;
  index: number;
  showPrintLabel?: boolean;
  showConfirm?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
}) {
  const items = order.orderItems || [];
  const firstItem = items[0] || {};
  const firstPhoto = firstItem.photo?.photo?.["240"]?.high || firstItem.photo?.photo?.["240"]?.low;
  const st = statusBadgeConfig[order.status] || { label: order.status, color: "#71717a", bg: "rgba(113,113,122,.15)" };
  const totalItems = items.reduce((s: number, it: any) => s + (it.amount || 0), 0);

  // For RETURNED orders, show the actual return date instead of order creation date.
  // Falls back to other terminal dates if returnDate is missing.
  const isReturned = order.status === "RETURNED";
  const displayDateLabel = isReturned ? "Qaytarilgan" : null;
  const displayDate = isReturned
    ? (order.returnDate ?? order.completedDate ?? order.deliveryDate ?? order.dateCreated)
    : order.dateCreated;

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index * 20, 240)}ms` }}
      className="animate-fade-in cv-auto rounded-xl bg-[#0f0f16] border border-[#1c1c24] hover:border-[#3f3f46] hover:bg-[#13131a] hover:shadow-lg transition-all cursor-pointer p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {selectable && (
          <label
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer transition-all",
              selected
                ? "bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#a78bfa]"
                : "bg-[#18181b] border-[#27272a] text-[#52525b] hover:border-[#3f3f46]"
            )}
            title="Ta'minlash uchun tanlash"
          >
            <input
              type="checkbox"
              checked={!!selected}
              onChange={(e) => onSelectionChange?.(e.target.checked)}
              className="sr-only"
            />
            {selected ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </label>
        )}
        <div className="flex-shrink-0 relative">
          <div className="w-[72px] h-[72px] rounded-xl bg-[#18181b] overflow-hidden flex items-center justify-center ring-1 ring-[#27272a]">
            {firstPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPhoto} alt={firstItem.title || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Package className="w-7 h-7 text-[#3f3f46]" />
            )}
          </div>
          {items.length > 1 && (
            <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#8b5cf6] text-[11px] font-bold text-white flex items-center justify-center ring-2 ring-[#0f0f16]">
              +{items.length - 1}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <CopyableId value={order.publicId || order.id} label="Order" />
            <span className="text-[11px] px-2.5 py-1 rounded-md font-semibold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
            {order.scheme && (
              <span className="text-[11px] px-2.5 py-1 rounded-md font-semibold bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
                {order.scheme}
              </span>
            )}
          </div>
          <p className="text-[15px] font-semibold text-white truncate leading-snug" title={firstItem.title}>
            {firstItem.title || "Nomsiz"}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-[#a1a1aa] flex-wrap">
            <Clock className="w-3.5 h-3.5" />
            {displayDateLabel && (
              <span className="text-[10px] uppercase tracking-wider text-[#f59e0b] font-semibold">{displayDateLabel}:</span>
            )}
            <span>{formatDate(displayDate)}</span>
            <span className="text-[#3f3f46]">·</span>
            <ShoppingBag className="w-3.5 h-3.5" />
            <span><span className="font-semibold text-white">{totalItems}</span> ta</span>
            {order.stock?.title && (
              <>
                <span className="text-[#3f3f46]">·</span>
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{order.stock.title}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jami</p>
            <p className="text-base font-bold text-white tabular-nums mt-0.5">{formatCurrency(order.price || 0)}</p>
          </div>
          {showConfirm && <ConfirmOrderButton orderId={order.id} />}
          {showPrintLabel && <PrintLabelButton orderId={order.id} />}
          <ChevronRight className="w-5 h-5 text-[#52525b]" />
        </div>
      </div>
    </div>
  );
}

// ─── Invoice (Ta'minlash) row ───────────────────────────────────────────

function InvoiceRow({ invoice, onClick, index }: { invoice: any; onClick: () => void; index: number }) {
  const status = invoice.status?.value || "UNKNOWN";
  const statusText = invoice.status?.text || status;
  const statusColors: Record<string, { color: string; bg: string }> = {
    CREATED:                { color: "#a78bfa", bg: "rgba(139,92,246,.15)" },
    ACCEPTANCE_IN_PROGRESS: { color: "#06b6d4", bg: "rgba(6,182,212,.15)" },
    ACCEPTED:               { color: "#10b981", bg: "rgba(16,185,129,.15)" },
    CANCELLED:              { color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  };
  const sc = statusColors[status] || { color: "#a1a1aa", bg: "rgba(113,113,122,.15)" };

  const slot = fmtSlot(invoice.timeSlot?.timeFrom, invoice.timeSlot?.timeTo);

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index * 20, 240)}ms` }}
      className="animate-fade-in cv-auto rounded-xl bg-[#0f0f16] border border-[#1c1c24] hover:border-[#3f3f46] hover:bg-[#13131a] hover:shadow-lg transition-all cursor-pointer p-5 grid grid-cols-12 gap-4 items-center"
    >
      <div className="col-span-12 md:col-span-2">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Raqam</p>
        <p className="text-sm font-mono font-semibold text-white mt-1">{invoice.number}</p>
      </div>
      <div className="col-span-6 md:col-span-2">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Holat</p>
        <span className="inline-block mt-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ color: sc.color, background: sc.bg }}>
          {statusText}
        </span>
      </div>
      <div className="col-span-6 md:col-span-3">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Ta'minlash vaqti</p>
        <p className="text-sm text-white mt-1">{slot}</p>
      </div>
      <div className="col-span-12 md:col-span-3">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Qabul qilish joyi</p>
        <p className="text-sm text-[#a1a1aa] mt-1 line-clamp-2" title={invoice.dropOffPoint?.address || invoice.stock?.title}>
          {invoice.dropOffPoint?.address || invoice.stock?.title || "—"}
        </p>
      </div>
      <div className="col-span-6 md:col-span-1 text-right">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Buyurtmalar</p>
        <p className="text-sm text-white mt-1 font-semibold tabular-nums">
          {invoice.numberAcceptedOrders ?? 0} / <span className="text-[#a1a1aa]">{invoice.numberOrders ?? 0}</span>
        </p>
      </div>
      <div className="col-span-6 md:col-span-1 text-right">
        <p className="text-[11px] text-[#71717a] uppercase tracking-wider font-semibold">Summa</p>
        <p className="text-sm font-bold text-white mt-1 tabular-nums">{formatCurrency(invoice.fullPrice || 0)}</p>
      </div>
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose }: { invoice: any | null; onClose: () => void }) {
  const { data: ordersData, isLoading } = useFbsInvoiceOrders(invoice?.id ?? null);
  const { printBatch, isLoading: batchPrinting, progress } = usePrintBatchLabels();
  const { run: printQrFast, isLoading: qrPrinting, progress: qrProgress } = usePrintQrFast();
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const { usdRate, displayCurrency } = useDashboardStore();
  const sellerName = useSellerName();
  const storeId = useAuthStore((s) => s.activeStoreId);
  if (!invoice) return null;

  const orders = ordersData?.orders || [];
  const status = invoice.status?.value || "UNKNOWN";
  const statusText = invoice.status?.text || status;
  const statusColors: Record<string, { color: string; bg: string }> = {
    CREATED:                { color: "#a78bfa", bg: "rgba(139,92,246,.15)" },
    ACCEPTANCE_IN_PROGRESS: { color: "#06b6d4", bg: "rgba(6,182,212,.15)" },
    ACCEPTED:               { color: "#10b981", bg: "rgba(16,185,129,.15)" },
    CANCELLED:              { color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  };
  const sc = statusColors[status] || { color: "#a1a1aa", bg: "rgba(113,113,122,.15)" };

  const totalQty = orders.reduce((s: number, o: any) => s + (o.items || []).reduce((t: number, it: any) => t + (it.amount || 1), 0), 0);
  const grandTotal = orders.reduce((s: number, o: any) => s + (o.fullPrice || 0), 0);

  // Mahsulotlar tan narxi yig'indisi (USD) — backend item.costUsd bilan boyitadi.
  // Joriy valyuta kursi bo'yicha so'mga aylantirib, tanlangan valyutada ko'rsatamiz.
  let costUsdTotal = 0;
  let costedQty = 0;
  for (const o of orders) {
    for (const it of o.items || []) {
      const qty = Number(it.amount) || 1;
      if (it.costUsd != null) { costUsdTotal += Number(it.costUsd) * qty; costedQty += qty; }
    }
  }
  const costUzsTotal = usdToUzs(costUsdTotal, usdRate);
  const costMissing = costedQty < totalQty; // ba'zi mahsulotlarga tan narx kiritilmagan

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
          className="relative w-full max-w-5xl bg-[#0a0a0f] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[#18181b] flex items-center justify-between sticky top-0 bg-[#0a0a0f] z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: sc.bg }}>
                <FileText className="w-5 h-5" style={{ color: sc.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#71717a]">Ta'minlash</p>
                <p className="text-sm font-semibold text-white truncate">#{invoice.number}</p>
              </div>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: sc.color, background: sc.bg }}>
                {statusText}
              </span>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] flex items-center justify-center">
              <X className="w-4 h-4 text-[#a1a1aa]" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#8b5cf6]" />
                  <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Qabul qilish punkti</p>
                </div>
                <p className="text-xs text-white">{invoice.dropOffPoint?.address || invoice.stock?.address || "—"}</p>
              </div>
              <div className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-[#06b6d4]" />
                  <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Ta'minlash vaqti</p>
                </div>
                <p className="text-xs text-white">
                  {fmtSlot(invoice.timeSlot?.timeFrom, invoice.timeSlot?.timeTo)}
                </p>
              </div>
              <div className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-4 h-4 text-[#10b981]" />
                  <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Buyurtmalar</p>
                </div>
                <p className="text-sm text-white">
                  <span className="text-xl font-bold">{invoice.numberOrders || 0}</span> ta buyurtma · <span className="text-xl font-bold text-[#10b981]">{totalQty}</span> dona mahsulot
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white">Buyurtmalar va mahsulotlar</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[#a1a1aa]">{orders.length} ta</span>
                  {orders.length > 0 && (
                    <>
                      <button
                        onClick={() => printPickingSheet(orders, `Ta'minlash #${invoice.number}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#34d399] hover:to-[#10b981] text-white text-xs font-semibold transition-all shadow-lg shadow-[#10b981]/20"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Yig'ish varaqasi
                      </button>
                      <button
                        onClick={async () => {
                          // Rasmiy Uzum PDF aktini ochamiz; bo'lmasa HTML fallback
                          const ok = await printInvoiceActPdf(storeId!, invoice.id, "act");
                          if (!ok) await printInvoiceAct(invoice, orders, { sellerName });
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] hover:from-[#fbbf24] hover:to-[#f59e0b] text-white text-xs font-semibold transition-all shadow-lg shadow-[#f59e0b]/20"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Dalolatnoma
                      </button>
                      <button
                        onClick={() => printBatch(orders.map((o: any) => o.orderId))}
                        disabled={batchPrinting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#8b5cf6]/20"
                      >
                        {batchPrinting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {progress.total > 0 ? `${progress.done}/${progress.total}` : "..."}
                          </>
                        ) : (
                          <>
                            <Printer className="w-3.5 h-3.5" />
                            Etiketkalar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => printQrFast(orders)}
                        disabled={qrPrinting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#06b6d4] to-[#0891b2] hover:from-[#0ec8e3] hover:to-[#0aa3c4] text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#06b6d4]/20"
                      >
                        {qrPrinting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {qrProgress.total > 0 ? `${qrProgress.done}/${qrProgress.total}` : "..."}
                          </>
                        ) : (
                          <>
                            <QrCode className="w-3.5 h-3.5" />
                            QR kodlar
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#52525b]">Mahsulotlar topilmadi</div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order: any) => (
                    <div key={order.orderId} className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-[#18181b] bg-[#13131a] flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Hash className="w-3.5 h-3.5 text-[#52525b]" />
                          <CopyableId value={order.orderId} label="Buyurtma" />
                          <span className="text-[11px] text-[#52525b]">·</span>
                          <span className="text-[11px] text-[#a1a1aa]">{(order.items || []).length} ta mahsulot</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white tabular-nums">{fmtSom(order.fullPrice || 0)}</p>
                          <PrintLabelButton orderId={order.orderId} compact />
                        </div>
                      </div>
                      <div className="divide-y divide-[#18181b]">
                        {(order.items || []).map((item: any) => {
                          const photoHi = item.photo?.photo?.["480"]?.high || item.photo?.photo?.["240"]?.high;
                          const photo = photoHi || item.photo?.photo?.["240"]?.low;
                          return (
                            <div key={item.orderId + "-" + item.barcode} className="px-4 py-3 flex items-center gap-3.5">
                              <button
                                onClick={() => photo && setZoomImg(photoHi || photo)}
                                className="group relative w-16 h-16 rounded-lg bg-[#18181b] overflow-hidden flex-shrink-0 flex items-center justify-center ring-1 ring-[#27272a] hover:ring-[#8b5cf6]/50 transition-all"
                                title="Kattalashtirish"
                              >
                                {photo ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={photo} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                                      <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                                    </span>
                                  </>
                                ) : (
                                  <Package className="w-6 h-6 text-[#3f3f46]" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white line-clamp-2 leading-snug" title={item.title}>{item.title}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {item.skuTitle && <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#18181b] text-[#a1a1aa]">{item.skuTitle}</span>}
                                  {item.barcode && <span className="text-[11px] font-mono text-[#52525b]">{item.barcode}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="text-center px-3 py-1.5 rounded-lg bg-[#10b981]/15 border border-[#10b981]/30">
                                  <p className="text-lg font-bold text-[#10b981] leading-none tabular-nums">{item.amount || 1}</p>
                                  <p className="text-[9px] text-[#10b981]/70 uppercase tracking-wide mt-0.5">dona</p>
                                </div>
                                <p className="text-sm font-bold text-white text-right whitespace-nowrap tabular-nums">{fmtSom(item.price || 0)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {/* Tan narx (yig'indi) */}
              <div className="rounded-xl bg-gradient-to-br from-[#f59e0b]/15 to-[#d97706]/5 border border-[#f59e0b]/30 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-[#fbbf24]" />
                  <span className="text-sm font-semibold text-white">Tan narx (yig'indi)</span>
                  {costMissing && (
                    <span className="text-[10px] text-[#f59e0b]/80">
                      · {costedQty}/{totalQty} dona narxi kiritilgan
                    </span>
                  )}
                </div>
                <span className="text-lg font-bold text-white tabular-nums">
                  {formatMoney(costUzsTotal, displayCurrency, usdRate)}
                </span>
              </div>

              {/* Ta'minlash summasi */}
              <div className="rounded-xl bg-gradient-to-br from-[#8b5cf6]/15 to-[#6d28d9]/5 border border-[#8b5cf6]/30 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#a78bfa]" />
                  <span className="text-sm font-semibold text-white">Ta'minlash summasi</span>
                </div>
                <span className="text-lg font-bold text-white tabular-nums">{fmtSom(invoice.fullPrice || grandTotal)}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Image zoom lightbox */}
        {zoomImg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={(e) => { e.stopPropagation(); setZoomImg(null); }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setZoomImg(null); }}
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomImg}
              alt="Mahsulot"
              className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function OrderDetailModal({ order, onClose }: { order: any | null; onClose: () => void }) {
  const { printAct, loading: actLoading } = usePrintInvoiceAct();
  if (!order) return null;
  const items = order.orderItems || [];
  const st = statusBadgeConfig[order.status] || { label: order.status, color: "#71717a", bg: "rgba(113,113,122,.15)" };
  const totalItems = items.reduce((s: number, it: any) => s + (it.amount || 0), 0);

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
          className="relative w-full max-w-3xl bg-[#0a0a0f] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[#18181b] flex items-center justify-between sticky top-0 bg-[#0a0a0f] z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: st.bg }}>
                <FileText className="w-5 h-5" style={{ color: st.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#71717a]">Buyurtma</p>
                <p className="text-sm font-semibold text-white truncate">#{order.publicId || order.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] flex items-center justify-center">
              <X className="w-4 h-4 text-[#a1a1aa]" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-5">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: st.color, background: st.bg }}>
                {st.label}
              </span>
              {order.scheme && (
                <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#18181b] border border-[#27272a] text-[#a1a1aa] inline-flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  {order.scheme}
                </span>
              )}
              <CopyableId value={order.id} label="ID" />
              {order.publicId && <CopyableId value={order.publicId} label="Public" />}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { label: "Yaratilgan", value: order.dateCreated },
                { label: "Qabul muddati", value: order.acceptUntil },
                { label: "Yetkazish muddati", value: order.deliverUntil },
                { label: "Qabul qilingan", value: order.acceptedDate },
                { label: "Yetkazilgan", value: order.deliveryDate },
                { label: "Yakunlangan", value: order.completedDate },
                { label: "Bekor qilingan", value: order.dateCancelled },
                { label: "Qaytarilgan", value: order.returnDate },
              ].filter((d) => d.value).map((d) => (
                <div key={d.label} className="rounded-lg bg-[#0f0f16] border border-[#1c1c24] p-2.5">
                  <p className="text-[10px] text-[#52525b] uppercase tracking-wider">{d.label}</p>
                  <p className="text-xs text-white mt-0.5">{formatDate(d.value as number)}</p>
                </div>
              ))}
            </div>

            {order.stock && (
              <div className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#06b6d4]" />
                  <p className="text-xs font-semibold text-white">{order.stock.title}</p>
                </div>
                <p className="text-[11px] text-[#71717a]">{order.stock.address}</p>
                {order.stock.timeFrom && order.stock.timeTo && (
                  <p className="text-[11px] text-[#52525b] mt-1">Ish vaqti: {order.stock.timeFrom} – {order.stock.timeTo}</p>
                )}
              </div>
            )}

            {order.deliveryInfo && (
              <div className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#8b5cf6]" />
                  <p className="text-xs font-semibold text-white">Mijoz ma'lumotlari</p>
                </div>
                <p className="text-xs text-white">{order.deliveryInfo.customerFullname}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]">
                  <Phone className="w-3 h-3" />
                  {order.deliveryInfo.customerPhone}
                </div>
                <p className="text-[11px] text-[#71717a]">{order.deliveryInfo.deliveryAddress}</p>
                {order.deliveryInfo.deliveryComment && (
                  <p className="text-[11px] text-[#52525b] italic">"{order.deliveryInfo.deliveryComment}"</p>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#71717a]">
                  Mahsulotlar ({items.length})
                </p>
                <p className="text-xs text-[#a1a1aa]">{totalItems} ta dona</p>
              </div>
              <div className="space-y-2">
                {items.map((item: any) => {
                  const photo = item.photo?.photo?.["240"]?.high || item.photo?.photo?.["240"]?.low;
                  return (
                    <div key={item.id} className="rounded-xl bg-[#0f0f16] border border-[#1c1c24] p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-[#18181b] overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Package className="w-5 h-5 text-[#3f3f46]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white line-clamp-1" title={item.title}>{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.skuTitle && <CopyableId value={item.skuTitle} label="SKU" />}
                          {item.barcode && <CopyableId value={item.barcode} label="BC" />}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-white">{formatCurrency(item.price || 0)}</p>
                        <p className="text-[10px] text-[#71717a]">x {item.amount || 1}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-[#8b5cf6]/15 to-[#6d28d9]/5 border border-[#8b5cf6]/30 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#a78bfa]" />
                <span className="text-sm font-semibold text-white">Buyurtma summasi</span>
              </div>
              <span className="text-lg font-bold text-white">{formatCurrency(order.price || 0)}</span>
            </div>

            {/* Yuborish dalolatnomasi — buyurtma ta'minlashga biriktirilgan bo'lsa */}
            {order.invoiceNumber && (
              <button
                onClick={() => printAct(order.invoiceNumber)}
                disabled={actLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] hover:from-[#fbbf24] hover:to-[#f59e0b] text-white text-sm font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#f59e0b]/20"
              >
                {actLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Yuborish dalolatnomasi (Ta'minlash №{order.invoiceNumber})
              </button>
            )}

            {/* Confirm button for CREATED orders */}
            {order.status === "CREATED" && (
              <button
                onClick={() => {
                  const btn = document.querySelector(`[data-confirm-order="${order.id}"]`) as HTMLButtonElement | null;
                  btn?.click();
                }}
                className="hidden"
                data-confirm-order={order.id}
              />
            )}
            {order.status === "CREATED" && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <ConfirmOrderButton orderId={order.id} />
                </div>
              </div>
            )}

            {/* DBS buyurtma amallari (faqat DBS sxemasida) */}
            {order.scheme === "DBS" && <DbsActions order={order} onDone={onClose} />}

            {/* Bekor qilish — hali yakunlanmagan/qaytarilmagan buyurtmalar uchun */}
            {["CREATED", "PACKING", "PENDING_DELIVERY"].includes(order.status) && (
              <CancelOrderButton orderId={order.id} onDone={onClose} />
            )}

            {order.cancelReason && (
              <div className="rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 p-3">
                <p className="text-xs font-semibold text-[#ef4444] mb-1">Bekor qilish sababi</p>
                <p className="text-xs text-[#fecaca]">{order.cancelReason}</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type Section = "orders" | "invoices";

export default function OrdersPage() {
  const [section, setSection] = useState<Section>("orders");
  const [activeTabId, setActiveTabId] = useState<string>("CREATED");
  const [page, setPage] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string | number>>(new Set());
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [scheme, setScheme] = useState<"ALL" | "FBS" | "DBS">("ALL");
  const pageSize = 20;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const { data: syncStatus } = useSyncStatus();
  const isConnected = syncStatus?.isConnected;

  useEffect(() => {
    const stored = localStorage.getItem("orders-tab");
    if (stored && tabs.some(t => t.id === stored)) setActiveTabId(stored);
    const storedSection = localStorage.getItem("orders-section") as Section | null;
    if (storedSection === "orders" || storedSection === "invoices") setSection(storedSection);
  }, []);
  useEffect(() => { localStorage.setItem("orders-tab", activeTabId); }, [activeTabId]);
  useEffect(() => { localStorage.setItem("orders-section", section); }, [section]);
  useEffect(() => { setSelectedOrderIds(new Set()); }, [activeTabId, page, scheme, section]);

  // Invoices section
  const { data: invoicesData, isLoading: invoicesLoading, isFetching: invoicesFetching, refetch: refetchInvoices } = useFbsInvoices({
    statuses: "CREATED,ACCEPTANCE_IN_PROGRESS,ACCEPTED,CANCELLED",
    page: 0,
    size: 20, // Uzum max page size
  });
  const invoices = invoicesData?.invoices || [];

  const { data: counts, isLoading: countsLoading, refetch: refetchCounts } = useFbsOrderCounts();
  const { data: ordersData, isLoading, isFetching, refetch } = useFbsOrders({
    status: activeTab.primary,
    page,
    size: pageSize,
    ...(scheme !== "ALL" ? { scheme: scheme as 'FBS' | 'DBS' } : {}),
  });

  // Sum across all statuses in the active tab (e.g. DELIVERING + ACCEPTED_AT_DP)
  const tabCount = (tab: TabConfig) =>
    tab.statuses.reduce((s, st) => s + (counts?.[st] ?? 0), 0);

  const rawOrders = ordersData?.orders || [];
  // On the RETURNED tab, sort by actual return date desc (newest first).
  // Uzum returns RETURNED orders in arbitrary order; the user expects chronological.
  const orders = useMemo(() => {
    if (activeTabId !== "RETURNED") return rawOrders;
    return [...rawOrders].sort((a: any, b: any) => {
      const da = Number(a.returnDate ?? a.completedDate ?? a.deliveryDate ?? a.dateCreated ?? 0);
      const db = Number(b.returnDate ?? b.completedDate ?? b.deliveryDate ?? b.dateCreated ?? 0);
      return db - da;
    });
  }, [rawOrders, activeTabId]);
  const selectedOrders = useMemo(
    () => orders.filter((order: any) => selectedOrderIds.has(order.id)),
    [orders, selectedOrderIds],
  );
  const activeCount = tabCount(activeTab);
  const totalPages = Math.max(1, Math.ceil(activeCount / pageSize));

  const totalAcrossTabs = useMemo(() => {
    if (!counts) return 0;
    return tabs.reduce((s, t) => s + tabCount(t), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  const handleRefresh = () => {
    if (section === "orders") { refetch(); refetchCounts(); }
    else { refetchInvoices(); }
  };

  // Print-label button shows up on rows for these tabs
  const showPrintLabelOnTabs = new Set(["PACKING", "PREPARING"]); // Yig'ishdagilar + Ta'minlashda
  const showPrintLabelForActive = showPrintLabelOnTabs.has(activeTabId);
  // Confirm button only on CREATED (Yangilar) tab
  const showConfirmForActive = activeTabId === "CREATED";
  const canCreateInvoiceForActive = activeTabId === "PACKING";
  const dueTodayCount = useMemo(() => orders.filter((order: any) => isOrderDueOn(order, 0)).length, [orders]);
  const dueTomorrowCount = useMemo(() => orders.filter((order: any) => isOrderDueOn(order, 1)).length, [orders]);
  const dueAfterTomorrowCount = useMemo(() => orders.filter((order: any) => isOrderDueOn(order, 2)).length, [orders]);
  const selectInvoiceOrders = (filter?: (order: any) => boolean) => {
    const next = filter ? orders.filter(filter) : orders;
    setSelectedOrderIds(new Set<string | number>(next.map((order: any) => order.id)));
  };

  // Batch print on the active orders list
  const { printBatch: printAllOnPage, isLoading: pagePrinting, progress: pageProgress } = usePrintBatchLabels();
  const { run: printAllQrOnPage, isLoading: pageQrPrinting, progress: pageQrProgress } = usePrintQrFast();

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buyurtmalar" subtitle="FBS / DBS buyurtmalari" />
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24]">
          <NotConnectedState />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="FBS / DBS"
        subtitle={section === "orders"
          ? `Buyurtmalar · Jami ${totalAcrossTabs} ta`
          : `Ta'minlashlar · ${invoices.length} ta`}
        action={
          <div className="flex items-center gap-2">
            {section === "orders" && (
              <div className="relative">
                <select
                  value={scheme}
                  onChange={(e) => { setScheme(e.target.value as "ALL" | "FBS" | "DBS"); setPage(0); }}
                  className="h-9 pl-3 pr-7 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-white appearance-none cursor-pointer hover:border-[#27272a] focus:outline-none focus:border-[#8b5cf6]"
                >
                  <option value="ALL" className="bg-[#0f0f16]">Barchasi</option>
                  <option value="FBS" className="bg-[#0f0f16]">FBS</option>
                  <option value="DBS" className="bg-[#0f0f16]">DBS</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#71717a] pointer-events-none" />
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={isFetching || invoicesFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#71717a] hover:text-white hover:border-[#27272a] transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (isFetching || invoicesFetching) && "animate-spin")} />
              <span className="hidden md:inline">Yangilash</span>
            </button>
          </div>
        }
      />

      {/* Top-level section tabs (FBS buyurtmalari / Ta'minlashlar) */}
      <div className="flex items-center gap-6 border-b border-[#1c1c24] -mx-2 px-2">
        {[
          { id: "orders" as Section,   label: "FBS buyurtmalari" },
          { id: "invoices" as Section, label: "Ta'minlashlar" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "relative py-3 text-sm font-medium transition-colors",
              section === s.id ? "text-white" : "text-[#71717a] hover:text-white"
            )}
          >
            {s.label}
            {section === s.id && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[#8b5cf6] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {section === "orders" && (
        <>
          {/* Status tabs */}
          <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-1.5 overflow-x-auto scrollbar-thin">
            <div className="flex items-center gap-1 min-w-max">
              {tabs.map((tab) => {
                const count = tabCount(tab);
                const active = activeTabId === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTabId(tab.id); setPage(0); }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                      active
                        ? "bg-gradient-to-br from-[#1f1f2a] to-[#18181b] text-white shadow-lg ring-1 ring-[#8b5cf6]/30"
                        : "text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/80"
                    )}
                  >
                    <span>{tab.label}</span>
                    {countsLoading && !counts ? (
                      <span className="w-7 h-5 rounded-full bg-[#27272a] animate-pulse" />
                    ) : count > 0 ? (
                      <span
                        className={cn(
                          "text-xs font-bold min-w-[22px] h-[22px] px-2 rounded-full inline-flex items-center justify-center tabular-nums shadow-sm",
                          active
                            ? ""
                            : "bg-[#27272a] text-white ring-1 ring-[#3f3f46]/50"
                        )}
                        style={
                          active
                            ? { color: "#fff", background: tab.bg, boxShadow: `0 0 12px ${tab.color}55` }
                            : undefined
                        }
                      >
                        {count}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#52525b]">0</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
            </div>
          )}

          {!isLoading && orders.length === 0 && (
            <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] py-16 text-center">
              <Box className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
              <p className="text-sm font-semibold text-white">Buyurtmalar topilmadi</p>
              <p className="text-xs text-[#52525b] mt-1">
                "{activeTab.label}" statusida hozircha buyurtma yo'q
              </p>
            </div>
          )}

          {!isLoading && orders.length > 0 && (
            <>
              {(showPrintLabelForActive || showConfirmForActive || canCreateInvoiceForActive) && (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-end gap-3">
                  {canCreateInvoiceForActive && (
                    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-white">Ta'minlash uchun tanlash</p>
                        <p className="text-xs text-[#71717a] mt-0.5">
                          {selectedOrders.length} ta tanlandi · muddat bo'yicha yoki sahifadagi hammasini tanlang
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { label: "Hammasi", count: orders.length, action: () => selectInvoiceOrders() },
                          { label: "Bugun", count: dueTodayCount, action: () => selectInvoiceOrders((order) => isOrderDueOn(order, 0)) },
                          { label: "Ertaga", count: dueTomorrowCount, action: () => selectInvoiceOrders((order) => isOrderDueOn(order, 1)) },
                          { label: "Indin", count: dueAfterTomorrowCount, action: () => selectInvoiceOrders((order) => isOrderDueOn(order, 2)) },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            onClick={preset.action}
                            disabled={preset.count === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-[#e5e7eb] hover:border-[#8b5cf6]/60 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:hover:border-[#27272a]"
                          >
                            <Check className="w-3.5 h-3.5 text-[#8b5cf6]" />
                            {preset.label}
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#27272a] text-[11px] text-white flex items-center justify-center">
                              {preset.count}
                            </span>
                          </button>
                        ))}
                        <button
                          onClick={() => setSelectedOrderIds(new Set())}
                          disabled={selectedOrders.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-transparent border border-[#27272a] text-[#a1a1aa] hover:text-white text-xs font-semibold transition-all disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                          Tozalash
                        </button>
                        <button
                          onClick={() => setCreateInvoiceOpen(true)}
                          disabled={selectedOrders.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-[#8b5cf6]/20"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Ta'minlash yaratish ({selectedOrders.length})
                        </button>
                      </div>
                    </div>
                  )}
                  {showPrintLabelForActive && (
                    <>
                      <button
                        onClick={() => printPickingSheet(orders, `${activeTab.label} (${orders.length} ta)`)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#34d399] hover:to-[#10b981] text-white text-xs font-semibold transition-all shadow-lg shadow-[#10b981]/20"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Yig'ish varaqasi
                      </button>
                      <button
                        onClick={() => printAllOnPage(orders.map((o: any) => o.id))}
                        disabled={pagePrinting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#8b5cf6]/20"
                      >
                        {pagePrinting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {pageProgress.total > 0 ? `${pageProgress.done}/${pageProgress.total}` : "..."}
                          </>
                        ) : (
                          <>
                            <Printer className="w-3.5 h-3.5" />
                            Etiketkalar ({orders.length})
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => printAllQrOnPage(orders)}
                        disabled={pageQrPrinting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-[#06b6d4] to-[#0891b2] hover:from-[#0ec8e3] hover:to-[#0aa3c4] text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#06b6d4]/20"
                      >
                        {pageQrPrinting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {pageQrProgress.total > 0 ? `${pageQrProgress.done}/${pageQrProgress.total}` : "..."}
                          </>
                        ) : (
                          <>
                            <QrCode className="w-3.5 h-3.5" />
                            QR kodlar
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {orders.map((order, i) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    index={i}
                    onClick={() => setSelectedOrder(order)}
                    showPrintLabel={showPrintLabelForActive}
                    showConfirm={showConfirmForActive}
                    selectable={canCreateInvoiceForActive}
                    selected={selectedOrderIds.has(order.id)}
                    onSelectionChange={(checked) => {
                      setSelectedOrderIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(order.id);
                        else next.delete(order.id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[#52525b]">
                Sahifa <span className="text-white font-medium">{page + 1}</span> / {totalPages} · Jami {activeCount} ta
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
        </>
      )}

      {section === "invoices" && (
        <>
          {invoicesLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
            </div>
          )}
          {!invoicesLoading && invoices.length === 0 && (
            <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] py-16 text-center">
              <FileText className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
              <p className="text-sm font-semibold text-white">Ta'minlashlar topilmadi</p>
              <p className="text-xs text-[#52525b] mt-1">Hozircha yaratilgan yoki qabul qilingan ta'minlash yo'q</p>
            </div>
          )}
          {!invoicesLoading && invoices.length > 0 && (
            <div className="space-y-2">
              {invoices.map((inv, i) => (
                <InvoiceRow key={inv.id} invoice={inv} index={i} onClick={() => setSelectedInvoice(inv)} />
              ))}
            </div>
          )}
        </>
      )}

      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      <CreateInvoiceModal
        open={createInvoiceOpen}
        orders={selectedOrders}
        onClose={() => setCreateInvoiceOpen(false)}
        onCreated={() => {
          setSelectedOrderIds(new Set());
          setSection("invoices");
          refetchInvoices();
        }}
      />
    </div>
  );
}
