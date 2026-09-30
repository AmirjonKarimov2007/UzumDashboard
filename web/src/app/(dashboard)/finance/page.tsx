"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  AlertCircle,
  Equal,
  Minus,
  Plus,
  Info,
  Calendar,
  Hash,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Database,
  Truck,
  Package,
  FileSpreadsheet,
  Download,
  Megaphone,
  Building2,
  Pencil,
  Trash2,
  CircleDollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import {
  useLogisticsAndFines,
  useManualWithdrawals,
  useProcessingAndWithdraw,
  useDashboardSummary,
  useSupplierPayments,
  type LogisticsFinesResponse,
  type ManualWithdrawalEntry,
  type ProcessingWithdrawResponse,
  type SupplierPaymentEntry,
} from "@/hooks/use-finance";
import { useDashboardStore, type Currency } from "@/stores/dashboard-store";
import { formatMoney } from "@/lib/currency";

// ─── Helpers ───────────────────────────────────────────────────────────────

// Oddiy kundalik format: "05.06.2026" (lokaldan mustaqil, hamma joyda bir xil)
function formatDate(ms?: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Display currency state — set by FinancePage on each render (before children render),
// so every formatSum() call across the page respects the chosen currency + live rate.
let _displayCurrency: Currency = "UZS";
let _usdRate = 0;
function setMoneyDisplay(c: Currency, rate: number) {
  _displayCurrency = c;
  _usdRate = rate;
}

function formatSum(n: number): string {
  // Amounts are stored in UZS; convert/format for the active display currency.
  // (negative handled by Math.abs at the value level — caller adds sign indicator.)
  return formatMoney(Math.round(n), _displayCurrency, _usdRate);
}

function signed(n: number, withSign = true): string {
  const formatted = formatSum(Math.abs(n));
  if (!withSign) return formatted;
  return n >= 0 ? `+ ${formatted}` : `− ${formatted}`;
}

// Returns YYYY-MM-DD in the local timezone (for <input type="date" />).
function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Default start: Dec 16, 2025 — when seller started selling on Uzum.
const DEFAULT_FROM_MS = new Date(2025, 11, 16).getTime(); // Dec 16, 2025 local midnight
const todayEndMs = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/**
 * Generate and download an .xlsx with separate sheets for Logistika, Jarimalar, and Summary.
 * Uses dynamic import so exceljs only loads when the user clicks Export.
 */
async function exportFinanceXlsx(opts: {
  dateFrom: number;
  dateTo: number;
  logistics: Array<{ description: string; amount: number; date: number | null; status: string; type: string }>;
  fines: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  marketing: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  storage: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  extensions: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  other: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  refunds: Array<{ description: string; amount: number; date: number | null; status?: string; type: string }>;
  totalLogistics: number;
  totalFines: number;
  totalMarketing: number;
  totalStorage: number;
  totalExtensions: number;
  totalOther: number;
  totalRefunds: number;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Uzum Dashboard";
  wb.created = new Date();

  const fmtDate = (ms: number | null) =>
    ms ? new Date(ms).toLocaleDateString("uz-UZ", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";
  const periodStr = `${toDateInputValue(opts.dateFrom)} — ${toDateInputValue(opts.dateTo)}`;

  // ─── Summary sheet ─────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Umumiy", { properties: { defaultRowHeight: 20 } });
  summary.columns = [
    { header: "Ko'rsatkich", key: "label", width: 36 },
    { header: "Qiymat", key: "value", width: 24, style: { numFmt: '#,##0 "so\'m"' } },
  ];
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } };

  summary.addRow({ label: "Davr", value: periodStr }).getCell(2).numFmt = "@";
  summary.addRow({ label: "Logistika (jami)", value: opts.totalLogistics });
  summary.addRow({ label: "Jarimalar (jami)", value: opts.totalFines });
  summary.addRow({ label: "Marketing (jami)", value: opts.totalMarketing });
  summary.addRow({ label: "Saqlash / ombor (jami)", value: opts.totalStorage });
  summary.addRow({ label: "Uzaytirish (jami)", value: opts.totalExtensions });
  summary.addRow({ label: "Boshqa xizmatlar (jami)", value: opts.totalOther });
  summary.addRow({ label: "Qaytarimlar (jami)", value: opts.totalRefunds });
  summary.addRow({ label: "Sof ushlanmalar", value: opts.totalLogistics + opts.totalFines + opts.totalMarketing + opts.totalStorage + opts.totalExtensions + opts.totalOther - opts.totalRefunds });
  summary.addRow({ label: "Logistika yozuvlari", value: opts.logistics.length }).getCell(2).numFmt = "#,##0";
  summary.addRow({ label: "Jarima yozuvlari", value: opts.fines.length }).getCell(2).numFmt = "#,##0";

  // ─── Logistika sheet ───────────────────────────────────────────────────
  const log = wb.addWorksheet("Logistika", { properties: { defaultRowHeight: 18 } });
  log.columns = [
    { header: "Sana", key: "date", width: 14 },
    { header: "Tavsif", key: "description", width: 70 },
    { header: "Status", key: "status", width: 16 },
    { header: "Manba", key: "type", width: 18 },
    { header: "Summa (so'm)", key: "amount", width: 18, style: { numFmt: '#,##0' } },
  ];
  log.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  log.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF97316" } };

  for (const r of opts.logistics) {
    log.addRow({
      date: fmtDate(r.date),
      description: r.description,
      status: r.status,
      type: r.type,
      amount: r.amount,
    });
  }
  // Total row
  const logTotalRow = log.addRow({ date: "", description: "", status: "", type: "JAMI", amount: opts.totalLogistics });
  logTotalRow.font = { bold: true };
  logTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };

  // ─── Jarimalar sheet ───────────────────────────────────────────────────
  const fin = wb.addWorksheet("Jarimalar", { properties: { defaultRowHeight: 18 } });
  fin.columns = [
    { header: "Sana", key: "date", width: 14 },
    { header: "Tavsif", key: "description", width: 70 },
    { header: "Status", key: "status", width: 16 },
    { header: "Manba", key: "type", width: 18 },
    { header: "Summa (so'm)", key: "amount", width: 18, style: { numFmt: '#,##0' } },
  ];
  fin.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  fin.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };

  for (const r of opts.fines) {
    fin.addRow({
      date: fmtDate(r.date),
      description: r.description,
      status: r.status || "—",
      type: r.type,
      amount: r.amount,
    });
  }
  const finTotalRow = fin.addRow({ date: "", description: "", status: "", type: "JAMI", amount: opts.totalFines });
  finTotalRow.font = { bold: true };
  finTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };

  for (const extra of [
    { name: "Marketing", rows: opts.marketing, total: opts.totalMarketing, color: "FFEC4899" },
    { name: "Saqlash", rows: opts.storage, total: opts.totalStorage, color: "FFF59E0B" },
    { name: "Uzaytirish", rows: opts.extensions, total: opts.totalExtensions, color: "FFA855F7" },
    { name: "Boshqa xizmatlar", rows: opts.other, total: opts.totalOther, color: "FFF59E0B" },
    { name: "Qaytarimlar", rows: opts.refunds, total: opts.totalRefunds, color: "FF10B981" },
  ]) {
    const sheet = wb.addWorksheet(extra.name, { properties: { defaultRowHeight: 18 } });
    sheet.columns = [
      { header: "Sana", key: "date", width: 14 },
      { header: "Tavsif", key: "description", width: 70 },
      { header: "Status", key: "status", width: 16 },
      { header: "Manba", key: "type", width: 18 },
      { header: "Summa (so'm)", key: "amount", width: 18, style: { numFmt: '#,##0' } },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: extra.color } };
    for (const row of extra.rows) sheet.addRow({ ...row, date: fmtDate(row.date), status: row.status || "—" });
    const totalRow = sheet.addRow({ date: "", description: "", status: "", type: "JAMI", amount: extra.total });
    totalRow.font = { bold: true };
  }

  // ─── Download ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moliya-${toDateInputValue(opts.dateFrom)}_${toDateInputValue(opts.dateTo)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Section components ────────────────────────────────────────────────────

function HeroCard({
  label,
  hint,
  value,
  loading,
  variant,
  icon: Icon,
}: {
  label: string;
  hint?: string;
  value: number;
  loading: boolean;
  variant: "primary" | "success";
  icon: any;
}) {
  const styles = {
    primary: {
      bg: "bg-gradient-to-br from-[#1a1626] via-[#0f0f16] to-[#0a0a0f]",
      iconBg: "bg-[#8b5cf6]/20 border-[#8b5cf6]/30",
      iconText: "text-[#a78bfa]",
      glow1: "bg-[#8b5cf6]/15",
      glow2: "bg-[#06b6d4]/10",
      value: "text-white",
    },
    success: {
      bg: "bg-gradient-to-br from-[#0a1f15] via-[#0f0f16] to-[#0a0a0f]",
      iconBg: "bg-[#10b981]/20 border-[#10b981]/30",
      iconText: "text-[#34d399]",
      glow1: "bg-[#10b981]/15",
      glow2: "bg-[#06b6d4]/8",
      value: "text-[#10b981]",
    },
  }[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("relative overflow-hidden rounded-2xl border border-[#27272a] p-7", styles.bg)}
    >
      <div className="absolute inset-0 pointer-events-none opacity-50">
        <div className={cn("absolute top-0 right-0 w-64 h-64 blur-3xl rounded-full", styles.glow1)} />
        <div className={cn("absolute bottom-0 left-0 w-48 h-48 blur-3xl rounded-full", styles.glow2)} />
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center", styles.iconBg)}>
            <Icon className={cn("w-4.5 h-4.5", styles.iconText)} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#a1a1aa] font-semibold">{label}</p>
            {hint && <p className="text-[10px] text-[#71717a]">{hint}</p>}
          </div>
        </div>
        {loading ? (
          <div className="h-12 w-56 rounded-lg bg-[#18181b]/60 animate-pulse" />
        ) : (
          <p className={cn("text-3xl md:text-4xl font-bold tabular-nums tracking-tight", styles.value)}>
            {formatSum(value)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Full P&L waterfall: gross → commission → logistics → net transfer → expenses →
 * net profit → withdrawals → balance. Every row shows operation, label, %, and amount.
 */
function PnlWaterfall({
  gross,
  commission,
  commissionPct,
  logistics,
  logisticsPct,
  transfer,
  otherExpenses,
  fines,
  netProfit,
  withdrawals,
  balance,
  loading,
}: {
  gross: number;
  commission: number;
  commissionPct: number;
  logistics: number;
  logisticsPct: number;
  transfer: number;
  otherExpenses: number;
  fines: number;
  netProfit: number;
  withdrawals: number;
  balance: number;
  loading: boolean;
}) {
  type Row =
    | { kind: "line"; label: string; sub?: string; value: number; op: "+" | "−"; color: string }
    | { kind: "total"; label: string; value: number; tone: "neutral" | "good" | "primary"; emphasis?: boolean };

  const rows: Row[] = [
    { kind: "line",  label: "Yalpi savdo (komissiya/logistikasiz)", sub: "Uzum'dagi jami sotuv summasi", value: gross, op: "+", color: "#10b981" },
    { kind: "line",  label: "Uzum komissiyasi", sub: `${commissionPct.toFixed(1)}% komissiya`, value: commission, op: "−", color: "#ef4444" },
    { kind: "line",  label: "Logistika va yetkazib berish", sub: `${logisticsPct.toFixed(1)}% ushlangan`, value: logistics, op: "−", color: "#f97316" },
    { kind: "total", label: "Sof tushum (balansga tushgan)", value: transfer, tone: "neutral" },
    { kind: "line",  label: "Jarimalar", sub: "Uzum tomonidan qo'yilgan jarimalar", value: fines, op: "−", color: "#dc2626" },
    { kind: "line",  label: "Boshqa chiqimlar", sub: "Reklama, qadoqlash, soliq va h.k.", value: otherExpenses, op: "−", color: "#f59e0b" },
    { kind: "total", label: "Toza foyda", value: netProfit, tone: "good", emphasis: true },
    { kind: "line",  label: "Yechib olingan mablag'", sub: "Bank hisobiga o'tkazilgan", value: withdrawals, op: "−", color: "#06b6d4" },
    { kind: "total", label: "Hozirgi balans (Uzum'da turgan)", value: balance, tone: "primary" },
  ];

  const toneStyle = {
    neutral:  { bg: "bg-[#18181b]/80 border-[#27272a]",                                       text: "text-white",     accentText: "text-white" },
    good:     { bg: "bg-gradient-to-r from-[#10b981]/15 to-[#10b981]/5 border-[#10b981]/30",  text: "text-white",     accentText: "text-[#34d399]" },
    primary:  { bg: "bg-gradient-to-r from-[#8b5cf6]/15 to-[#6d28d9]/5 border-[#8b5cf6]/30",  text: "text-white",     accentText: "text-[#a78bfa]" },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[#8b5cf6]/15 flex items-center justify-center">
          <Equal className="w-4.5 h-4.5 text-[#a78bfa]" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">To'liq hisob-kitob (P&L)</h3>
          <p className="text-[11px] text-[#71717a]">Yalpi savdodan hozirgi balansgacha — har bir qadam</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-[#18181b]/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            if (row.kind === "total") {
              const t = toneStyle[row.tone];
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between px-4 rounded-xl border",
                    t.bg,
                    row.emphasis ? "py-5" : "py-4",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "rounded-md flex items-center justify-center",
                      row.emphasis ? "w-9 h-9" : "w-7 h-7",
                      row.tone === "good" ? "bg-[#10b981]/25" : row.tone === "primary" ? "bg-[#8b5cf6]/25" : "bg-[#27272a]"
                    )}>
                      <Equal className={cn(
                        row.emphasis ? "w-4 h-4" : "w-3.5 h-3.5",
                        row.tone === "good" ? "text-[#34d399]" : row.tone === "primary" ? "text-[#a78bfa]" : "text-[#a1a1aa]"
                      )} />
                    </div>
                    <span className={cn("font-semibold", row.emphasis ? "text-base" : "text-sm", t.text)}>
                      {row.label}
                    </span>
                  </div>
                  <span className={cn(
                    "font-bold tabular-nums",
                    row.emphasis ? "text-2xl" : "text-lg",
                    t.accentText,
                  )}>
                    {formatSum(row.value)}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#18181b]/40 border border-transparent hover:border-[#1c1c24] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center text-base font-bold flex-shrink-0"
                    style={{ color: row.color, background: `${row.color}15` }}
                  >
                    {row.op}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-[#e4e4e7] truncate">{row.label}</p>
                    {row.sub && <p className="text-[11px] text-[#71717a] truncate">{row.sub}</p>}
                  </div>
                </div>
                <span className="text-sm font-semibold text-white tabular-nums whitespace-nowrap ml-3">
                  {formatSum(row.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: any;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">{label}</p>
      </div>
      {loading ? (
        <div className="h-7 w-32 rounded bg-[#18181b]/60 animate-pulse" />
      ) : (
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
      )}
      {hint && <p className="text-xs text-[#71717a] mt-1">{hint}</p>}
    </div>
  );
}

function WithdrawalsList({
  items,
  total,
  loading,
}: {
  items: Array<{ id: string; uzumRef?: string; amount: number; date: number | null; description: string; type: string; status?: string }>;
  total: number;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#06b6d4]/15 flex items-center justify-center">
            <ArrowDownToLine className="w-4 h-4 text-[#06b6d4]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Yechib olingan mablag'lar</h3>
            <p className="text-[11px] text-[#71717a]">{items.length} ta so'rovnoma</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jami</p>
          <p className="text-base font-bold text-[#06b6d4] tabular-nums">{formatSum(total)}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#06b6d4] animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <Receipt className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-sm text-[#a1a1aa]">Hozircha yechib olishlar yo'q</p>
        </div>
      ) : (
        <div className="divide-y divide-[#1c1c24]">
          {items.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="px-5 py-4 flex items-center gap-4 hover:bg-[#13131a] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#06b6d4]/12 border border-[#06b6d4]/20 flex items-center justify-center flex-shrink-0">
                <ArrowDownToLine className="w-4.5 h-4.5 text-[#06b6d4]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white truncate" title={w.description}>
                    {w.description || "Mablag' yechib olish"}
                  </p>
                  {w.status && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-[#10b981]/15 text-[#10b981] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {w.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#71717a] flex-wrap">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(w.date)}</span>
                  {w.uzumRef && (
                    <>
                      <span className="text-[#3f3f46]">·</span>
                      <Hash className="w-3 h-3" />
                      <span className="font-mono">{w.uzumRef}</span>
                    </>
                  )}
                  <span className="text-[#3f3f46]">·</span>
                  <span className="font-mono text-[10px] uppercase text-[#52525b]">{w.type}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-[#06b6d4] tabular-nums">− {formatSum(w.amount)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function FinesList({
  items,
  total,
  loading,
}: {
  items: Array<{ id: string; type: string; description: string; amount: number; date: number | null }>;
  total: number;
  loading: boolean;
}) {
  if (!loading && items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-[#10b981]/12 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Jarimalar yo'q</p>
          <p className="text-[11px] text-[#71717a]">Uzum tomonidan jarima qo'yilmagan — yaxshi ish!</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#dc2626]/20 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#dc2626]/15 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-[#dc2626]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Jarimalar</h3>
            <p className="text-[11px] text-[#71717a]">{items.length} ta jarima</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jami</p>
          <p className="text-base font-bold text-[#dc2626] tabular-nums">{formatSum(total)}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#dc2626] animate-spin" />
        </div>
      ) : (
        <div className="divide-y divide-[#1c1c24]">
          {items.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="px-5 py-4 flex items-center gap-4 hover:bg-[#13131a] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#dc2626]/12 border border-[#dc2626]/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-[#dc2626]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate" title={f.description}>
                  {f.description || "Jarima"}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#71717a] flex-wrap">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(f.date)}</span>
                  <span className="text-[#3f3f46]">·</span>
                  <span className="font-mono text-[10px] uppercase text-[#52525b]">{f.type}</span>
                </div>
              </div>
              <p className="text-sm font-bold text-[#dc2626] tabular-nums whitespace-nowrap">− {formatSum(f.amount)}</p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Service payments (Xizmatga to'lovlar) — logistics, delivery, packaging, fulfillment, storage etc.
 * Pulled from /v1/finance/expenses, classified by service keyword, split into income (refunds)
 * vs outcome (deductions), and grouped by status.
 */
function ServicePaymentsSection({
  list,
  totalIncome,
  totalOutcome,
  net,
  byStatus,
  loading,
}: {
  list: Array<{ id: string; type: string; description: string; amount: number; direction: 'income' | 'outcome'; date: number | null; status: string }>;
  totalIncome: number;
  totalOutcome: number;
  net: number;
  byStatus: Record<string, { count: number; income: number; outcome: number; net: number }>;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const statusEntries = Object.entries(byStatus).sort((a, b) =>
    (b[1].outcome + b[1].income) - (a[1].outcome + a[1].income),
  );

  // Pick a color per status (best-effort: success/paid → green, pending → amber, failed/cancel → red)
  const statusTone = (status: string): { text: string; bg: string; border: string } => {
    const s = status.toUpperCase();
    if (/SUCCESS|PAID|COMPLET|DONE|EXECUT/.test(s))   return { text: "#10b981", bg: "rgba(16,185,129,.12)",  border: "rgba(16,185,129,.25)" };
    if (/PENDING|PROCESS|WAIT|IN_PROGRESS/.test(s))   return { text: "#f59e0b", bg: "rgba(245,158,11,.12)",  border: "rgba(245,158,11,.25)" };
    if (/FAIL|CANCEL|REJECT|ERROR/.test(s))           return { text: "#ef4444", bg: "rgba(239,68,68,.12)",   border: "rgba(239,68,68,.25)" };
    if (/REFUND|RETURN/.test(s))                      return { text: "#06b6d4", bg: "rgba(6,182,212,.12)",   border: "rgba(6,182,212,.25)" };
    return { text: "#a1a1aa", bg: "rgba(113,113,122,.12)", border: "rgba(113,113,122,.25)" };
  };

  const filtered = statusFilter ? list.filter((l) => l.status === statusFilter) : list;
  const visible = expanded ? filtered : filtered.slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#f97316]/15 border border-[#f97316]/25 flex items-center justify-center">
            <Truck className="w-4.5 h-4.5 text-[#f97316]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Xizmatga to'lovlar</h3>
            <p className="text-[11px] text-[#71717a]">
              Logistika, yetkazib berish, qadoqlash · {list.length} ta yozuv · <code className="text-[10px] text-[#a1a1aa]">/v1/finance/expenses</code>
            </p>
          </div>
        </div>
      </div>

      {/* Aggregate summary: income / outcome / net */}
      <div className="grid grid-cols-3 divide-x divide-[#1c1c24] border-b border-[#1c1c24]">
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">
            <ArrowUpFromLine className="w-3 h-3 text-[#10b981]" />
            Kirim (qaytarish)
          </div>
          {loading ? (
            <div className="h-6 w-24 rounded bg-[#18181b]/60 animate-pulse mt-1.5" />
          ) : (
            <p className="text-lg font-bold text-[#10b981] tabular-nums mt-1">+ {formatSum(totalIncome)}</p>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">
            <ArrowDownToLine className="w-3 h-3 text-[#ef4444]" />
            Chiqim (to'lov)
          </div>
          {loading ? (
            <div className="h-6 w-24 rounded bg-[#18181b]/60 animate-pulse mt-1.5" />
          ) : (
            <p className="text-lg font-bold text-[#ef4444] tabular-nums mt-1">− {formatSum(totalOutcome)}</p>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">
            <Equal className="w-3 h-3 text-[#a78bfa]" />
            Sof xarajat
          </div>
          {loading ? (
            <div className="h-6 w-24 rounded bg-[#18181b]/60 animate-pulse mt-1.5" />
          ) : (
            <p className={cn("text-lg font-bold tabular-nums mt-1", net >= 0 ? "text-[#f97316]" : "text-[#10b981]")}>
              {net >= 0 ? "− " : "+ "}{formatSum(Math.abs(net))}
            </p>
          )}
        </div>
      </div>

      {/* By status grid */}
      {!loading && statusEntries.length > 0 && (
        <div className="px-5 py-4 border-b border-[#1c1c24]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Status bo'yicha</p>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="text-[11px] text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
              >
                Filtrni tozalash ×
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {statusEntries.map(([status, agg]) => {
              const tone = statusTone(status);
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(active ? null : status)}
                  className={cn(
                    "text-left px-3 py-2.5 rounded-xl border transition-all",
                    active
                      ? "ring-2 ring-[#a78bfa]/40 border-[#8b5cf6]/40 bg-[#1a1626]"
                      : "border-transparent bg-[#18181b]/50 hover:bg-[#18181b]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md"
                      style={{ color: tone.text, background: tone.bg, border: `1px solid ${tone.border}` }}
                    >
                      {status}
                    </span>
                    <span className="text-[10px] text-[#71717a] tabular-nums">{agg.count} ta</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[11px] tabular-nums">
                    {agg.income > 0 && (
                      <div className="flex justify-between text-[#10b981]">
                        <span>Kirim</span><span>+ {formatSum(agg.income)}</span>
                      </div>
                    )}
                    {agg.outcome > 0 && (
                      <div className="flex justify-between text-[#ef4444]">
                        <span>Chiqim</span><span>− {formatSum(agg.outcome)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-white pt-0.5 border-t border-[#27272a]/50 mt-1">
                      <span>Sof</span><span>{formatSum(Math.abs(agg.net))}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#f97316] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center">
          <Package className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-sm text-[#a1a1aa]">
            {statusFilter ? `"${statusFilter}" statusida xizmat to'lovi yo'q` : "Xizmatga to'lovlar topilmadi"}
          </p>
          {!statusFilter && (
            <p className="text-[11px] text-[#71717a] mt-1">
              Uzum Finance API ruxsati yoqilganda bu yerda logistika va xizmatga to'lovlar ko'rinadi
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#1c1c24]">
            {visible.map((s, i) => {
              const tone = statusTone(s.status);
              const isIncome = s.direction === 'income';
              return (
                <div
                  key={s.id}
                  style={{ animationDelay: `${Math.min(i * 20, 240)}ms` }}
                  className="animate-fade-in px-5 py-3 flex items-center gap-4 hover:bg-[#13131a] transition-colors"
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    isIncome ? "bg-[#10b981]/12 border border-[#10b981]/20" : "bg-[#f97316]/12 border border-[#f97316]/20"
                  )}>
                    {isIncome
                      ? <ArrowUpFromLine className="w-4 h-4 text-[#10b981]" />
                      : <Truck className="w-4 h-4 text-[#f97316]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white truncate" title={s.description}>{s.description}</p>
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ color: tone.text, background: tone.bg, border: `1px solid ${tone.border}` }}
                      >
                        {s.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#71717a]">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(s.date)}</span>
                      <span className="text-[#3f3f46]">·</span>
                      <span className="font-mono text-[10px] uppercase">{s.type}</span>
                    </div>
                  </div>
                  <p className={cn(
                    "text-sm font-bold tabular-nums whitespace-nowrap",
                    isIncome ? "text-[#10b981]" : "text-[#ef4444]"
                  )}>
                    {isIncome ? "+ " : "− "}{formatSum(s.amount)}
                  </p>
                </div>
              );
            })}
          </div>
          {filtered.length > 8 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-5 py-3 border-t border-[#1c1c24] text-xs text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Yopish" : `Yana ${filtered.length - 8} ta ko'rsatish`}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

function DataSourceBanner({
  sources,
}: {
  sources: { orders: 'uzum' | 'local' | 'none'; expenses: 'uzum' | 'local' | 'none'; errors: string[] };
}) {
  const allUzum = sources.orders === 'uzum' && sources.expenses === 'uzum';
  if (allUzum) return null;

  const anyMissing = sources.orders === 'none' || sources.expenses === 'none';
  const tone = anyMissing
    ? { bg: 'bg-[#ef4444]/10', border: 'border-[#ef4444]/20', icon: 'text-[#ef4444]', title: 'text-[#ef4444]' }
    : { bg: 'bg-[#f59e0b]/10', border: 'border-[#f59e0b]/20', icon: 'text-[#f59e0b]', title: 'text-[#f59e0b]' };

  return (
    <div className={cn("rounded-2xl p-4 flex items-start gap-3 border", tone.bg, tone.border)}>
      <Database className={cn("w-5 h-5 mt-0.5 flex-shrink-0", tone.icon)} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", tone.title)}>Uzum Finance API ruxsati yo'q</p>
        <p className="text-xs text-[#a1a1aa] mt-0.5">
          Sotuvlar: <span className="font-semibold text-white">{sources.orders === 'uzum' ? "Uzum'dan (live)" : sources.orders === 'local' ? "mahalliy ma'lumotlardan" : "yo'q"}</span>
          {" · "}
          Xarajatlar: <span className="font-semibold text-white">{sources.expenses === 'uzum' ? "Uzum'dan (live)" : sources.expenses === 'local' ? "mahalliy ma'lumotlardan" : "yo'q"}</span>
        </p>
        <p className="text-[11px] text-[#71717a] mt-1.5">
          To'liq ma'lumot uchun: Uzum Seller panel → Sozlamalar → API integratsiya → kalitga <code className="px-1 py-0.5 rounded bg-[#18181b] text-[#a1a1aa]">Finance</code> ruxsatini bering.
        </p>
        {sources.errors.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] text-[#71717a] cursor-pointer hover:text-[#a1a1aa]">Texnik tafsilot</summary>
            <ul className="mt-1 text-[11px] text-[#71717a] space-y-0.5 pl-4">
              {sources.errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function OtherExpensesList({
  items,
  total,
  loading,
}: {
  items: Array<{ id: string; type: string; description: string; amount: number; date: number | null }>;
  total: number;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/15 flex items-center justify-center">
            <Receipt className="w-4 h-4 text-[#f59e0b]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Boshqa xarajatlar</h3>
            <p className="text-[11px] text-[#71717a]">{items.length} ta yozuv</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jami</p>
          <p className="text-base font-bold text-[#f59e0b] tabular-nums">{formatSum(total)}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#f59e0b] animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#a1a1aa]">Boshqa xarajatlar yo'q</div>
      ) : (
        <>
          <div className="divide-y divide-[#1c1c24]">
            {visible.map((e, i) => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0">
                  <Minus className="w-3.5 h-3.5 text-[#71717a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate" title={e.description}>{e.description || e.type}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#71717a]">
                    <span>{formatDate(e.date)}</span>
                    <span className="text-[#3f3f46]">·</span>
                    <span className="font-mono text-[10px] uppercase">{e.type}</span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-[#f59e0b] tabular-nums">− {formatSum(e.amount)}</p>
              </div>
            ))}
          </div>
          {items.length > 5 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-5 py-3 border-t border-[#1c1c24] text-xs text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Yopish" : `Yana ${items.length - 5} ta ko'rsatish`}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

function ExpensesByTypeCard({
  types,
  loading,
}: {
  types: Array<{ type: string; count: number; total: number; sample?: string; classified: "withdrawal" | "other" }>;
  loading: boolean;
}) {
  if (!loading && types.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-[#71717a]" />
        <h3 className="text-sm font-semibold text-white">Xarajat turlari (Uzum API javobidan)</h3>
      </div>
      <p className="text-[11px] text-[#71717a] mb-4">
        Agar biror tur "withdrawal" deb noto'g'ri belgilangan bo'lsa, ayting — heuristikani sozlaymiz.
      </p>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded bg-[#18181b]/40 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.type} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#18181b]/40">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0",
                    t.classified === "withdrawal" ? "bg-[#06b6d4]/15 text-[#06b6d4]" : "bg-[#71717a]/15 text-[#a1a1aa]"
                  )}
                >
                  {t.classified === "withdrawal" ? "Withdrawal" : "Other"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-white truncate">{t.type}</p>
                  {t.sample && t.sample !== t.type && (
                    <p className="text-[10px] text-[#71717a] truncate" title={t.sample}>{t.sample}</p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p className="text-xs font-semibold text-white tabular-nums">{formatSum(t.total)}</p>
                <p className="text-[10px] text-[#71717a]">{t.count} ta</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Compact date-range bar. Shows current range + Sana picker + preset chips.
 * Default: Dec 16, 2025 → today.
 */
function DateRangeBar({
  fromMs,
  toMs,
  onChange,
}: {
  fromMs: number;
  toMs: number;
  onChange: (from: number, to: number) => void;
}) {
  const presets: Array<{ label: string; from: number; to: number }> = [
    { label: "Sotuv boshidan (16-dek 2025)", from: DEFAULT_FROM_MS, to: todayEndMs() },
    {
      label: "Oxirgi 30 kun",
      from: Date.now() - 30 * 24 * 3600 * 1000,
      to: todayEndMs(),
    },
    {
      label: "Oxirgi 7 kun",
      from: Date.now() - 7 * 24 * 3600 * 1000,
      to: todayEndMs(),
    },
    {
      label: "Bu oy",
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
      to: todayEndMs(),
    },
  ];

  return (
    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <Calendar className="w-4 h-4 text-[#a78bfa] flex-shrink-0" />
        <span className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Davr:</span>
        <input
          type="date"
          value={toDateInputValue(fromMs)}
          onChange={(e) => {
            const v = new Date(e.target.value);
            v.setHours(0, 0, 0, 0);
            onChange(v.getTime(), toMs);
          }}
          className="bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8b5cf6] [color-scheme:dark]"
        />
        <span className="text-[#52525b] text-xs">→</span>
        <input
          type="date"
          value={toDateInputValue(toMs)}
          onChange={(e) => {
            const v = new Date(e.target.value);
            v.setHours(23, 59, 59, 999);
            onChange(fromMs, v.getTime());
          }}
          className="bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8b5cf6] [color-scheme:dark]"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {presets.map((p) => {
          const active = Math.abs(p.from - fromMs) < 24 * 3600 * 1000 && Math.abs(p.to - toMs) < 24 * 3600 * 1000;
          return (
            <button
              key={p.label}
              onClick={() => onChange(p.from, p.to)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap",
                active
                  ? "bg-[#8b5cf6]/20 border border-[#8b5cf6]/40 text-[#a78bfa]"
                  : "bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Top-of-page summary: Jarayonda (PROCESSING) + To'langan (TO_WITHDRAW) + Jami to'lanadi.
 * Pulls from /v1/finance/orders. Each card shows sum(sellerProfit + logisticDeliveryFee).
 */
function ProcessingAndWithdrawCard({
  processingTotal,
  withdrawTotal,
  processingCount,
  withdrawCount,
  processingItems,
  withdrawItems,
  loading,
}: {
  processingTotal: number;
  withdrawTotal: number;
  processingCount: number;     // unique orderId
  withdrawCount: number;       // unique orderId
  processingItems: number;     // total items (dublicates included)
  withdrawItems: number;       // total items (dublicates included)
  loading: boolean;
}) {
  const combined = processingTotal + withdrawTotal;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#27272a] bg-gradient-to-br from-[#0a1424] via-[#0f0f16] to-[#0a0a0f] p-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#06b6d4]/10 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-[#10b981]/10 blur-3xl rounded-full" />
      </div>

      <div className="relative">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider text-[#a1a1aa] font-semibold">Sotuvlardan tushadigan pul</p>
          <h2 className="text-base font-semibold text-white mt-1">Jarayonda va To'langan</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Jarayonda */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#06b6d4]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#06b6d4]/15 flex items-center justify-center">
                <Loader2 className="w-3.5 h-3.5 text-[#06b6d4]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jarayonda</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#06b6d4] tabular-nums">{formatSum(processingTotal)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">
              {processingCount} ta order
              {processingItems !== processingCount && <span className="text-[#52525b]"> ({processingItems} item)</span>}
              {" · sellerProfit + logistika"}
            </p>
          </div>

          {/* To'langan */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#10b981]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#10b981]/15 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">To'langan</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#10b981] tabular-nums">{formatSum(withdrawTotal)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">
              {withdrawCount} ta order
              {withdrawItems !== withdrawCount && <span className="text-[#52525b]"> ({withdrawItems} item)</span>}
              {" · sellerProfit + logistika"}
            </p>
          </div>

          {/* Jami to'lanadi */}
          <div className="rounded-xl bg-gradient-to-br from-[#8b5cf6]/12 to-[#6d28d9]/5 border border-[#8b5cf6]/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#8b5cf6]/20 flex items-center justify-center">
                <Equal className="w-3.5 h-3.5 text-[#a78bfa]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#a78bfa] font-semibold">Jami to'lanadi</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-white tabular-nums">{formatSum(combined)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">Jarayonda + To'langan</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Big prominent card showing total logistics + total fines for the selected period,
 * with an Excel export button.
 */
function LogisticsAndFinesCard({
  totalLogistics,
  totalFines,
  totalMarketing,
  totalOther,
  totalRefunds,
  logisticsCount,
  finesCount,
  marketingCount,
  otherCount,
  refundsCount,
  loading,
  onExport,
  exportDisabled,
  exporting,
}: {
  totalLogistics: number;
  totalFines: number;
  totalMarketing: number;
  totalOther: number;
  totalRefunds: number;
  logisticsCount: number;
  finesCount: number;
  marketingCount: number;
  otherCount: number;
  refundsCount: number;
  loading: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  exporting: boolean;
}) {
  // "Jami yechilgan" = BARCHA OUTCOME (Logistika + Jarima + Marketing + Boshqa).
  // Refundlar (INCOME) bu yerga kirmaydi.
  const totalCombined = totalLogistics + totalFines + totalMarketing + totalOther;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#27272a] bg-gradient-to-br from-[#1a1010] via-[#0f0f16] to-[#0a0a0f] p-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#f97316]/10 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-[#dc2626]/10 blur-3xl rounded-full" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#a1a1aa] font-semibold">Tanlangan davrda</p>
            <h2 className="text-base font-semibold text-white mt-1">Logistika va Jarimalar</h2>
          </div>
          <button
            onClick={onExport}
            disabled={exportDisabled || exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#34d399] hover:to-[#10b981] text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#10b981]/20"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>{exporting ? "Tayyorlanmoqda..." : "Excel'ga yuklab olish"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
          {/* Logistika */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#f97316]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#f97316]/15 flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 text-[#f97316]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Logistika</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#f97316] tabular-nums">{formatSum(totalLogistics)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">{logisticsCount} ta yozuv</p>
          </div>

          {/* Jarimalar */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#dc2626]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#dc2626]/15 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5 text-[#dc2626]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Jarimalar</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#dc2626] tabular-nums">{formatSum(totalFines)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">{finesCount} ta yozuv</p>
          </div>

          {/* Marketing — pulli targ'ibot / reklama (alohida kategoriya) */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#ec4899]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#ec4899]/15 flex items-center justify-center">
                <Megaphone className="w-3.5 h-3.5 text-[#ec4899]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Marketing</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#ec4899] tabular-nums">{formatSum(totalMarketing)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">{marketingCount} ta reklama yozuvi</p>
          </div>

          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#f59e0b]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#f59e0b]/15 flex items-center justify-center"><Receipt className="w-3.5 h-3.5 text-[#fbbf24]" /></div>
              <p className="text-[11px] text-[#71717a] font-semibold">Boshqa xizmatlar</p>
            </div>
            {loading ? <div className="h-8 w-32 rounded bg-[#18181b]/60 animate-pulse" /> : <p className="text-2xl font-bold text-[#fbbf24] tabular-nums">{formatSum(totalOther)}</p>}
            <p className="text-[11px] text-[#71717a] mt-1">{otherCount} ta yozuv</p>
          </div>

          {/* Qaytarilgan pullar — INCOME items (not included in fines or combined) */}
          <div className="rounded-xl bg-[#0f0f16]/80 border border-[#10b981]/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#10b981]/15 flex items-center justify-center">
                <ArrowDownToLine className="w-3.5 h-3.5 text-[#10b981]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold">Qaytarilgan pullar</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[#10b981] tabular-nums">{formatSum(totalRefunds)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">{refundsCount} ta INCOME yozuvi</p>
          </div>

          {/* Combined */}
          <div className="rounded-xl bg-gradient-to-br from-[#8b5cf6]/12 to-[#6d28d9]/5 border border-[#8b5cf6]/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#8b5cf6]/20 flex items-center justify-center">
                <Equal className="w-3.5 h-3.5 text-[#a78bfa]" />
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[#a78bfa] font-semibold">Jami yechilgan</p>
            </div>
            {loading ? (
              <div className="h-8 w-40 rounded bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-white tabular-nums">{formatSum(totalCombined)}</p>
            )}
            <p className="text-[11px] text-[#71717a] mt-1">Barcha OUTCOME yozuvlari</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Manual Withdrawals Section ─────────────────────────────────────────────

/**
 * Parsed withdrawal entry from bank SMS format
 */
interface ManualWithdrawal {
  id: string;           // Unique ID for localStorage
  orderId: string;      // e.g. "1729177"
  status: string;       // e.g. "bajarildi"
  amount: number;       // parsed amount
  date?: string;        // optional date string
  addedAt: number;      // timestamp when added
}

/**
 * Parse bank SMS text and extract withdrawal entries
 * Format example:
 * Hisobvaraqqa pul mablagʻlarini oʻtkazish 20218000907362367001
 * #1729177
 * bajarildi
 * 3 452 148  so'm
 * (optional date line like "27/03/2026")
 */
function parseBankSMS(text: string): ManualWithdrawal[] {
  const entries: ManualWithdrawal[] = [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l);

  let currentEntry: Partial<ManualWithdrawal> = {};

  for (const line of lines) {
    // Extract order ID (e.g. "#1729177")
    const orderIdMatch = line.match(/^#(\d+)$/);
    if (orderIdMatch) {
      if (currentEntry.orderId && currentEntry.amount) {
        // Complete previous entry
        entries.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
          orderId: currentEntry.orderId,
          status: currentEntry.status || "noma'lum",
          amount: currentEntry.amount,
          date: currentEntry.date,
          addedAt: Date.now(),
        });
      }
      currentEntry = { orderId: orderIdMatch[1] };
      continue;
    }

    // Extract amount (e.g. "3 452 148  so'm" or "27/03/2026" + amount)
    // Look for lines with numbers and "so'm" or just large numbers
    const amountMatch = line.match(/([\d\s]+)\s*so'?m/i);
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(/\s/g, '');
      const amount = parseInt(amountStr, 10);
      if (!isNaN(amount) && amount > 0) {
        currentEntry.amount = amount;
      }
      continue;
    }

    // Check for date format (e.g. "27/03/2026")
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dateMatch && !currentEntry.amount) {
      // Only treat as date if it's a separate line before amount
      const [, day, month, year] = dateMatch;
      currentEntry.date = `${year}-${month}-${day}`;
      continue;
    }

    // Status line (bajarildi, etc.) - capture if not already captured
    if (!currentEntry.status && line.length < 30 && !line.match(/\d{16,}/)) {
      currentEntry.status = line;
    }
  }

  // Don't forget the last entry
  if (currentEntry.orderId && currentEntry.amount) {
    entries.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      orderId: currentEntry.orderId,
      status: currentEntry.status || "noma'lum",
      amount: currentEntry.amount,
      date: currentEntry.date,
      addedAt: Date.now(),
    });
  }

  return entries;
}

/**
 * Combined parser for multiple formats in one paste
 * Handles both structured SMS and simpler formats
 */
function parseWithdrawalsText(text: string): ManualWithdrawal[] {
  const entries: ManualWithdrawal[] = [];

  // Try bank SMS format first
  const smsEntries = parseBankSMS(text);
  if (smsEntries.length > 0) {
    return smsEntries;
  }

  // Fallback: look for patterns like "#ID status amount" on single lines
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    // Pattern: #1234567 bajarildi 3 452 148 so'm
    const match = line.match(/^#(\d+)\s+(\S+)\s+([\d\s]+)\s*so'?m?/i);
    if (match) {
      const [, orderId, status, amountStr] = match;
      const amount = parseInt(amountStr.replace(/\s/g, ''), 10);
      if (!isNaN(amount) && amount > 0) {
        entries.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
          orderId,
          status,
          amount,
          addedAt: Date.now(),
        });
      }
    }
  }

  return entries;
}

const MANUAL_WITHDRAWALS_STORAGE_KEY = 'uzum_manual_withdrawals';

function LegacyManualWithdrawalsSection({ onTotalChange }: { onTotalChange?: (total: number) => void }) {
  const [entries, setEntries] = useState<ManualWithdrawal[]>([]);
  const [inputText, setInputText] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Load from localStorage on mount
  useState(() => {
    try {
      const stored = localStorage.getItem(MANUAL_WITHDRAWALS_STORAGE_KEY);
      if (stored) {
        setEntries(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  });

  const totalAmount = useMemo(() => entries.reduce((sum, e) => sum + e.amount, 0), [entries]);

  // Report total up to parent so the "To'lanadi" formula can use it
  useEffect(() => {
    onTotalChange?.(totalAmount);
  }, [totalAmount, onTotalChange]);

  const handleParse = () => {
    if (!inputText.trim()) return;

    const parsed = parseWithdrawalsText(inputText);
    if (parsed.length === 0) {
      toast.error("Ma'lumot topilmadi. Text formatini tekshiring.");
      return;
    }

    // Merge with existing entries (avoid duplicates by order ID)
    const existingIds = new Set(entries.map(e => e.orderId));
    const newEntries = parsed.filter(e => !existingIds.has(e.orderId));

    if (newEntries.length === 0) {
      toast.warning("Barcha buyurtmalar avval qo'shilgan.");
      setInputText('');
      return;
    }

    const updated = [...entries, ...newEntries].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    setEntries(updated);
    try {
      localStorage.setItem(MANUAL_WITHDRAWALS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }

    setInputText('');
    toast.success(`${newEntries.length} ta yozuv qo'shildi.`);
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    try {
      localStorage.setItem(MANUAL_WITHDRAWALS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
    toast.success("Yozuv o'chirildi.");
  };

  const handleClearAll = () => {
    if (confirm("Barcha yozuvlarni o'chirmoqchimisiz?")) {
      setEntries([]);
      try {
        localStorage.removeItem(MANUAL_WITHDRAWALS_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      toast.success("Barcha yozuvlar o'chirildi.");
    }
  };

  const visible = expanded ? entries : entries.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#06b6d4]/15 border border-[#06b6d4]/25 flex items-center justify-center">
            <ArrowDownToLine className="w-4.5 h-4.5 text-[#06b6d4]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Yechib olingan pullar</h3>
            <p className="text-[11px] text-[#71717a]">
              {entries.length} ta yozuv · Jami: <span className="text-[#06b6d4] font-semibold">{formatSum(totalAmount)}</span>
            </p>
          </div>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-[11px] text-[#71717a] hover:text-[#ef4444] transition-colors px-2 py-1 rounded hover:bg-[#ef4444]/10"
          >
            Hammasini o'chirish
          </button>
        )}
      </div>

      {/* Input section */}
      <div className="p-4 border-b border-[#1c1c24] bg-[#0a0a0f]/50">
        <p className="text-[11px] text-[#71717a] mb-2">
          Bank xabari textini shu yerga tashlang. Format:
        </p>
        <div className="rounded-lg bg-[#18181b] border border-[#27272a] p-3 text-[10px] text-[#a1a1aa] font-mono mb-3">
          Hisobvaraqqa pul mablagʻlarini oʻtkazish 20218000907362367001<br/>
          #1729177<br/>
          bajarildi<br/>
          3 452 148 so'm
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Bank xabar matnini shu yerga tashlang..."
          className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] resize-none h-24"
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleParse}
            disabled={!inputText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] hover:from-[#a78bfa] hover:to-[#8b5cf6] text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#8b5cf6]/20"
          >
            <Plus className="w-3.5 h-3.5" />
            Qo'shish
          </button>
          <button
            onClick={() => setInputText('')}
            disabled={!inputText.trim()}
            className="text-[11px] text-[#71717a] hover:text-white transition-colors disabled:opacity-50 px-2 py-2"
          >
            Tozalash
          </button>
        </div>
      </div>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="py-10 text-center">
          <Receipt className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-sm text-[#a1a1aa]">Yechib olingan pullar yo'q</p>
          <p className="text-[11px] text-[#71717a] mt-1">
            Bank xabarlarini yuqoridagi maydonga tashlang, biz qolganini qilamiz.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#1c1c24]">
            {visible.map((entry, i) => (
              <div
                key={entry.id}
                style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                className="animate-fade-in px-5 py-3 flex items-center gap-4 hover:bg-[#13131a] transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-[#06b6d4]/12 border border-[#06b6d4]/20 flex items-center justify-center flex-shrink-0">
                  <ArrowDownToLine className="w-4 h-4 text-[#06b6d4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">#{entry.orderId}</span>
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-[#10b981]/15 text-[#10b981]"
                    >
                      {entry.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#71717a]">
                    <Calendar className="w-3 h-3" />
                    <span>{entry.date ? formatDate(new Date(entry.date).getTime()) : formatDate(entry.addedAt)}</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <p className="text-sm font-bold text-[#06b6d4] tabular-nums whitespace-nowrap">
                    {formatSum(entry.amount)}
                  </p>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717a] hover:text-[#ef4444] p-1"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {entries.length > 5 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-5 py-3 border-t border-[#1c1c24] text-xs text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Yopish" : `Yana ${entries.length - 5} ta ko'rsatish`}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

/**
 * Server-backed bank withdrawal ledger. Unlike the former localStorage version,
 * these rows survive browser/device changes and are available to every permitted
 * user of the store.
 */
function ManualWithdrawalsDatabaseSection({
  onTotalChange,
  dateFrom,
  dateTo,
}: {
  onTotalChange?: (total: number) => void;
  dateFrom?: number;
  dateTo?: number;
}) {
  const { data, isLoading, create, update, remove } = useManualWithdrawals(dateFrom, dateTo);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [paste, setPaste] = useState("");
  const [editing, setEditing] = useState<ManualWithdrawalEntry | null>(null);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  useEffect(() => onTotalChange?.(total), [onTotalChange, total]);

  const resetForm = () => {
    setReference(""); setAmount(""); setOccurredAt(new Date().toISOString().slice(0, 10)); setNote(""); setEditing(null);
  };
  const submit = async () => {
    const normalized = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      toast.error("To'g'ri summa kiriting.");
      return;
    }
    const payload = {
      amount: normalized,
      occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(),
      reference: reference.trim() || undefined,
      status: "bajarildi",
      note: note.trim() || undefined,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success("Yechib olish yozuvi yangilandi.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Yechib olish yozuvi bazaga saqlandi.");
      }
      resetForm();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Yozuvni saqlab bo'lmadi.");
    }
  };
  const edit = (entry: ManualWithdrawalEntry) => {
    setEditing(entry);
    setReference(entry.reference ?? "");
    setAmount(String(entry.amount));
    setOccurredAt(new Date(entry.occurredAt).toISOString().slice(0, 10));
    setNote(entry.note ?? "");
  };
  const deleteEntry = async (entry: ManualWithdrawalEntry) => {
    if (!confirm(`${entry.reference ? `#${entry.reference}` : "Bu"} yozuv o'chirilsinmi?`)) return;
    try {
      await remove.mutateAsync(entry.id);
      if (editing?.id === entry.id) resetForm();
      toast.success("Yozuv o'chirildi.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Yozuvni o'chirib bo'lmadi.");
    }
  };
  const importSms = async () => {
    const parsed = parseWithdrawalsText(paste);
    if (!parsed.length) return toast.error("Bank xabaridan summa va so'rov raqami topilmadi.");
    try {
      await Promise.all(parsed.map((item) => create.mutateAsync({
        amount: item.amount,
        occurredAt: item.date ? new Date(`${item.date}T12:00:00`).toISOString() : new Date().toISOString(),
        reference: item.orderId,
        status: item.status,
      })));
      setPaste("");
      toast.success(`${parsed.length} ta yozuv bazaga saqlandi.`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Yozuvlarni saqlab bo'lmadi.");
    }
  };

  return (
    <section className="rounded-2xl border border-[#1c1c24] bg-[#0f0f16] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#06b6d4]/15 border border-[#06b6d4]/25 grid place-items-center"><ArrowDownToLine className="w-4.5 h-4.5 text-[#06b6d4]" /></div>
          <div><h2 className="text-base font-semibold text-white">Yechib olingan pullar</h2><p className="text-[11px] text-[#71717a]">Bazaga saqlanadi · {data?.count ?? 0} ta yozuv · <span className="text-[#06b6d4]">{formatSum(total)}</span></p></div>
        </div>
        <span className="rounded-full bg-[#10b981]/10 px-2.5 py-1 text-[10px] text-[#34d399]">Do'kon bo'yicha umumiy tarix</span>
      </div>
      <div className="grid xl:grid-cols-[1.1fr_.9fr] border-b border-[#1c1c24]">
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-white">{editing ? "Yozuvni tahrirlash" : "Yangi bank o'tkazmasi"}</p>{editing && <button onClick={resetForm} className="text-xs text-[#a1a1aa] hover:text-white">Bekor qilish</button>}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-[#a1a1aa]">Summa (so'm)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3 452 148" className="mt-1.5 w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#06b6d4]" /></label>
            <label className="text-[11px] text-[#a1a1aa]">Sana<input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="mt-1.5 w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#06b6d4]" /></label>
            <label className="text-[11px] text-[#a1a1aa]">So'rov / operatsiya raqami<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="#1729177" className="mt-1.5 w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#06b6d4]" /></label>
            <label className="text-[11px] text-[#a1a1aa]">Izoh (ixtiyoriy)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank hisobiga o'tkazildi" className="mt-1.5 w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#06b6d4]" /></label>
          </div>
          <button onClick={submit} disabled={create.isPending || update.isPending} className="inline-flex items-center gap-2 rounded-xl bg-[#0891b2] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0e7490] disabled:opacity-50"><Plus className="w-4 h-4" />{editing ? "O'zgarishni saqlash" : "Bazaga saqlash"}</button>
        </div>
        <div className="p-5 bg-[#0a0a0f]/55 border-t xl:border-t-0 xl:border-l border-[#1c1c24]">
          <p className="text-sm font-medium text-white">Bank SMS dan import</p><p className="mt-1 text-[11px] leading-5 text-[#71717a]">Bir nechta SMS ni qo'ying. Har bir so'rov raqami va summa alohida saqlanadi.</p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'#1729177\nbajarildi\n3 452 148 so\'m'} className="mt-3 h-24 w-full resize-none rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-xs text-white outline-none focus:border-[#8b5cf6]" />
          <button onClick={importSms} disabled={!paste.trim() || create.isPending} className="mt-2 text-xs text-[#a78bfa] hover:text-white disabled:opacity-50">SMS yozuvlarini bazaga import qilish</button>
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-[#1c1c24]">
        {isLoading ? <div className="p-5 text-sm text-[#71717a]">Yozuvlar yuklanmoqda…</div> : entries.length === 0 ? <div className="p-8 text-center text-sm text-[#71717a]">Hali qo'lda kiritilgan yechib olish yo'q.</div> : entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#14141b]">
            <div className="w-8 h-8 rounded-lg bg-[#06b6d4]/10 grid place-items-center"><ArrowDownToLine className="w-4 h-4 text-[#06b6d4]" /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-white">{entry.reference ? `#${entry.reference}` : "Bank o'tkazmasi"}</p><p className="text-[11px] text-[#71717a]">{formatDate(entry.occurredAt)}{entry.note ? ` · ${entry.note}` : ""}</p></div>
            <p className="text-sm font-bold tabular-nums text-[#06b6d4]">− {formatSum(entry.amount)}</p>
            <button onClick={() => edit(entry)} className="px-2 py-1 text-[11px] text-[#a1a1aa] hover:text-white">Tahrirlash</button><button onClick={() => deleteEntry(entry)} disabled={remove.isPending} className="px-2 py-1 text-[11px] text-[#71717a] hover:text-[#ef4444]">O'chirish</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Top-of-page net payout formula:
 *   To'lanadi = Jami to'lanadi − Jami yechilgan − Yechib olingan pullar + Qaytarilgan pullar
 * Shows the big final number plus a transparent step-by-step breakdown of how it's derived.
 */
function PayoutFormulaCard({
  jamiTolanadi,
  jamiYechilgan,
  yechibOlingan,
  qaytarilgan,
  loading,
}: {
  jamiTolanadi: number;
  jamiYechilgan: number;
  yechibOlingan: number;
  qaytarilgan: number;
  loading: boolean;
}) {
  const result = jamiTolanadi - jamiYechilgan - yechibOlingan + qaytarilgan;

  const terms: Array<{
    op: "+" | "−" | "=";
    label: string;
    sub: string;
    value: number;
    color: string;
    icon: any;
    base?: boolean;
  }> = [
    { op: "=", label: "Jami to'lanadi",        sub: "Uzum API: buyurtmalarning sellerProfit'i", value: jamiTolanadi, color: "#a78bfa", icon: Wallet,         base: true },
    { op: "−", label: "Uzum ushlanmalari",     sub: "API: yechishlar, logistika, jarima va boshqalar", value: jamiYechilgan, color: "#f97316", icon: Truck },
    { op: "−", label: "Yechib olingan pullar", sub: "Bankka o'tkazilgan (qo'lda kiritilgan)", value: yechibOlingan, color: "#06b6d4", icon: ArrowDownToLine },
    { op: "+", label: "Qaytarilgan pullar",    sub: "INCOME yozuvlari (qaytarishlar)",       value: qaytarilgan,  color: "#10b981", icon: ArrowUpFromLine },
  ];

  const positive = result >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#8b5cf6]/30 bg-gradient-to-br from-[#16121f] via-[#0f0f16] to-[#0a0a0f] p-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none opacity-50">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#8b5cf6]/15 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-[#10b981]/10 blur-3xl rounded-full" />
      </div>

      <div className="relative">
        {/* Hero: title + final number */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[#a78bfa]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#a78bfa] font-semibold">To'lanadi</p>
              <p className="text-[12px] text-[#71717a]">Hisobingizga tushishi kutilayotgan sof mablag'</p>
            </div>
          </div>
          <div className="md:text-right">
            {loading ? (
              <div className="h-11 w-64 rounded-lg bg-[#18181b]/60 animate-pulse" />
            ) : (
              <p className={cn("text-4xl md:text-5xl font-bold tabular-nums tracking-tight", positive ? "text-[#10b981]" : "text-[#ef4444]")}>
                {formatSum(result)}
              </p>
            )}
          </div>
        </div>

        {/* Breakdown — how the number comes out */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-[#18181b]/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {terms.map((t, i) => {
              const Icon = t.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl border",
                    t.base
                      ? "bg-[#8b5cf6]/10 border-[#8b5cf6]/25"
                      : "bg-[#18181b]/40 border-transparent",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Operation sign */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0"
                      style={{ color: t.color, background: `${t.color}1a` }}
                    >
                      {t.op}
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${t.color}14` }}>
                      <Icon className="w-4 h-4" style={{ color: t.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.label}</p>
                      <p className="text-[11px] text-[#71717a] truncate">{t.sub}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums whitespace-nowrap ml-3" style={{ color: t.color }}>
                    {t.op === "−" ? "− " : t.op === "+" ? "+ " : ""}{formatSum(t.value)}
                  </span>
                </div>
              );
            })}

            {/* Equals result */}
            <div className={cn(
              "flex items-center justify-between px-4 py-4 rounded-xl border mt-1",
              positive
                ? "bg-gradient-to-r from-[#10b981]/15 to-[#10b981]/5 border-[#10b981]/30"
                : "bg-gradient-to-r from-[#ef4444]/15 to-[#ef4444]/5 border-[#ef4444]/30",
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  positive ? "bg-[#10b981]/25" : "bg-[#ef4444]/25",
                )}>
                  <Equal className={cn("w-4 h-4", positive ? "text-[#34d399]" : "text-[#f87171]")} />
                </div>
                <span className="text-base font-semibold text-white">To'lanadi (sof)</span>
              </div>
              <span className={cn("text-2xl font-bold tabular-nums", positive ? "text-[#10b981]" : "text-[#ef4444]")}>
                {formatSum(result)}
              </span>
            </div>
          </div>
        )}

        {/* Inline formula caption */}
        <p className="text-[11px] text-[#52525b] mt-4 text-center">
          Uzum API tushumi − API ushlanmalari − bazadagi bank o'tkazmalari + API qaytarimlari
        </p>
      </div>
    </motion.div>
  );
}

// ─── Logistika/Jarimalar uchun davr filtri ──────────────────────────────────

type LogRange = { from: number; to: number } | null;

const startOfDayMs = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endOfDayMs = (ms: number) => { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); };

/**
 * Compact filter bar for the Logistika va Jarimalar card. Quick presets
 * (Hammasi / Bugun / Kecha / 7 kun / 30 kun / Bu oy) + custom from–to.
 * `null` value = Hammasi (butun tarix).
 */
function LogFinesFilterBar({ value, onChange }: { value: LogRange; onChange: (r: LogRange) => void }) {
  const now = Date.now();
  const presets: Array<{ id: string; label: string; range: LogRange }> = [
    { id: "all", label: "Hammasi", range: null },
    { id: "today", label: "Bugun", range: { from: startOfDayMs(now), to: endOfDayMs(now) } },
    { id: "yesterday", label: "Kecha", range: { from: startOfDayMs(now - 86400000), to: endOfDayMs(now - 86400000) } },
    { id: "7d", label: "7 kun", range: { from: startOfDayMs(now - 6 * 86400000), to: endOfDayMs(now) } },
    { id: "30d", label: "30 kun", range: { from: startOfDayMs(now - 29 * 86400000), to: endOfDayMs(now) } },
    { id: "month", label: "Bu oy", range: { from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), to: endOfDayMs(now) } },
  ];

  const matches = (r: LogRange) => {
    if (r === null && value === null) return true;
    if (r === null || value === null) return false;
    return Math.abs(r.from - value.from) < 60000 && Math.abs(r.to - value.to) < 60000;
  };
  const isCustom = value !== null && !presets.some((p) => p.range !== null && matches(p.range));

  return (
    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-3 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        <Calendar className="w-4 h-4 text-[#a78bfa] flex-shrink-0" />
        <span className="text-[11px] uppercase tracking-wider text-[#71717a] font-semibold mr-1">Davr:</span>
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.range)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap",
              matches(p.range)
                ? "bg-[#8b5cf6] text-white"
                : "bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="date"
          value={value ? toDateInputValue(value.from) : ""}
          max={toDateInputValue(now)}
          onChange={(e) => {
            if (!e.target.value) return;
            const from = startOfDayMs(new Date(e.target.value).getTime());
            const to = value ? value.to : endOfDayMs(now);
            onChange({ from, to: Math.max(from, to) });
          }}
          className={cn(
            "bg-[#18181b] border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8b5cf6] [color-scheme:dark]",
            isCustom ? "border-[#8b5cf6]/50" : "border-[#27272a]",
          )}
        />
        <span className="text-[#52525b] text-xs">→</span>
        <input
          type="date"
          value={value ? toDateInputValue(value.to) : ""}
          max={toDateInputValue(now)}
          onChange={(e) => {
            if (!e.target.value) return;
            const to = endOfDayMs(new Date(e.target.value).getTime());
            const from = value ? value.from : startOfDayMs(to);
            onChange({ from: Math.min(from, to), to });
          }}
          className={cn(
            "bg-[#18181b] border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8b5cf6] [color-scheme:dark]",
            isCustom ? "border-[#8b5cf6]/50" : "border-[#27272a]",
          )}
        />
        {value && (
          <button onClick={() => onChange(null)} className="text-[#52525b] hover:text-[#ef4444] p-1" title="Tozalash">
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function FinanceAuditOverview({
  data,
  expenses,
  usdRate,
  loading,
}: {
  data?: ProcessingWithdrawResponse;
  expenses?: LogisticsFinesResponse;
  usdRate: number;
  loading: boolean;
}) {
  const processing = data?.processing;
  const processingTotal = processing?.total || 0;
  const withdrawTotal = data?.withdraw.total || 0;
  const ordersTotal = processingTotal + withdrawTotal;
  const logisticsTotal = expenses?.logisticsTotal || 0;
  const finesTotal = expenses?.finesTotal || 0;
  const marketingTotal = expenses?.marketingTotal || 0;
  const storageTotal = expenses?.storageTotal || 0;
  const extensionTotal = expenses?.extensionTotal || 0;
  const otherTotal = expenses?.otherTotal || 0;
  const refundsTotal = expenses?.refundsTotal || 0;
  const calculatedBalance = ordersTotal - logisticsTotal - finesTotal - marketingTotal - storageTotal - extensionTotal - otherTotal + refundsTotal;
  const balanceCostUsd = data?.currentCostUsd
    ?? ((data?.processing.costUsd || 0) + (data?.withdraw.costUsd || 0));
  const balanceCostUzs = balanceCostUsd * usdRate;
  const sellerNetProfit = calculatedBalance - balanceCostUzs;
  const costedQty = (data?.processing.costedQty || 0) + (data?.withdraw.costedQty || 0);
  const totalQty = (data?.processing.totalQty || 0) + (data?.withdraw.totalQty || 0);
  const costCoverage = totalQty > 0 ? (costedQty / totalQty) * 100 : 100;

  const formulaItems = [
    { label: "Jarayondagi pul", value: processingTotal, op: null, tone: "text-[#67e8f9]", hint: "PROCESSING" },
    { label: "Yechishga tayyor", value: withdrawTotal, op: "+", tone: "text-[#34d399]", hint: "TO_WITHDRAW qoldig‘i" },
    { label: "Logistika", value: logisticsTotal, op: "−", tone: "text-[#fb923c]", hint: "yetkazish to‘lovlari" },
    { label: "Marketing", value: marketingTotal, op: "−", tone: "text-[#f472b6]", hint: "reklama va targ‘ibot" },
    { label: "Saqlash", value: storageTotal, op: "−", tone: "text-[#fbbf24]", hint: "ombor / saqlash" },
    { label: "Uzaytirish", value: extensionTotal, op: "−", tone: "text-[#c084fc]", hint: "muddat uzaytirish" },
    { label: "Qolgan jarimalar", value: finesTotal, op: "−", tone: "text-[#f87171]", hint: "boshqa barcha jarima" },
    { label: "Boshqa xizmatlar", value: otherTotal, op: "−", tone: "text-[#fca5a5]", hint: "qolgan OUTCOME" },
    { label: "Qaytgan pullar", value: refundsTotal, op: "+", tone: "text-[#6ee7b7]", hint: "INCOME yozuvlari" },
    { label: "Hozirgi balans", value: calculatedBalance, op: "=", tone: calculatedBalance >= 0 ? "text-white" : "text-[#f87171]", hint: "yakuniy natija", result: true },
  ];

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#263041] bg-[#0d1117] shadow-[0_18px_50px_rgba(0,0,0,.18)]">
      <div className="border-b border-[#263041] px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f8fafc]">
              <Wallet className="h-4 w-4 text-[#22c55e]" />Pul qayerdan chiqdi?
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-[#94a3b8]">
              Chapdan o‘ngga o‘qing: yashil “+” pulni qo‘shadi, qizil “−” xarajatni ayiradi. Har bir raqam Uzum yozuvlaridan alohida hisoblangan.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#334155] bg-[#111827] px-3 py-1.5 text-[11px] font-medium text-[#cbd5e1]">
            <Database className="h-3.5 w-3.5 text-[#38bdf8]" />Uzum ochilgandan hozirgacha
          </span>
        </div>
        <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <p className="text-xs text-[#94a3b8]">Hozir Uzumda qolgan pul</p>
            {loading ? <div className="mt-2 h-14 w-72 animate-pulse rounded-xl bg-[#172033]" /> : <p className={cn("mt-1 text-4xl font-bold tracking-[-0.035em] tabular-nums sm:text-5xl", calculatedBalance >= 0 ? "text-[#f8fafc]" : "text-[#f87171]")}>{formatSum(calculatedBalance)}</p>}
          </div>
          <p className="pb-1 text-xs text-[#64748b]">Savdo puli: {formatSum(ordersTotal)}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-[#334155] bg-[#080b10] p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1.08fr] sm:items-stretch">
            <div className="rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/8 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[#fcd34d]">Mahsulot tannarxi</p>
                <Package className="h-4 w-4 text-[#fbbf24]" />
              </div>
              {loading ? <div className="mt-2 h-7 w-32 animate-pulse rounded bg-[#1e293b]" /> : <p className="mt-1.5 text-xl font-bold tabular-nums text-[#fbbf24]">{formatSum(balanceCostUzs)}</p>}
              <p className="mt-1 text-[10px] leading-4 text-[#94a3b8]">Balansda qolgan mahsulotlarning Smartup tan narxi</p>
            </div>

            <div className="flex items-center justify-center py-1 text-lg font-bold text-[#94a3b8]">+</div>

            <div className={cn("rounded-xl border px-4 py-3.5", sellerNetProfit >= 0 ? "border-[#22c55e]/25 bg-[#22c55e]/8" : "border-[#fb7185]/25 bg-[#fb7185]/8")}>
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-xs font-medium", sellerNetProfit >= 0 ? "text-[#86efac]" : "text-[#fda4af]")}>Seller sof foydasi</p>
                <TrendingUp className={cn("h-4 w-4", sellerNetProfit >= 0 ? "text-[#4ade80]" : "text-[#fb7185]")} />
              </div>
              {loading ? <div className="mt-2 h-7 w-32 animate-pulse rounded bg-[#1e293b]" /> : <p className={cn("mt-1.5 text-xl font-bold tabular-nums", sellerNetProfit >= 0 ? "text-[#4ade80]" : "text-[#fb7185]")}>{formatSum(sellerNetProfit)}</p>}
              <p className="mt-1 text-[10px] leading-4 text-[#94a3b8]">Hozirgi balans − mahsulot tannarxi</p>
            </div>

            <div className="flex items-center justify-center py-1 text-lg font-bold text-[#7dd3fc]">=</div>

            <div className="rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[#bae6fd]">Hozirgi jami balans</p>
                <Equal className="h-4 w-4 text-[#7dd3fc]" />
              </div>
              {loading ? <div className="mt-2 h-7 w-32 animate-pulse rounded bg-[#1e293b]" /> : <p className="mt-1.5 text-xl font-bold tabular-nums text-[#f8fafc]">{formatSum(calculatedBalance)}</p>}
              <p className="mt-1 text-[10px] leading-4 text-[#94a3b8]">Yuqoridagi katta summaning aynan o‘zi</p>
            </div>
          </div>

          <div className={cn("mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] leading-5", costCoverage >= 99.99 ? "bg-[#22c55e]/8 text-[#86efac]" : "bg-[#fbbf24]/8 text-[#fcd34d]")}>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Tannarx aniqligi: <span className="font-semibold tabular-nums">{costCoverage.toFixed(1)}%</span>
              {costCoverage >= 99.99
                ? " — balansdagi barcha mahsulotlarda tan narx topildi."
                : ` — ${Math.max(0, totalQty - costedQty).toFixed(1)} dona mahsulotda tan narx yo‘q; seller foydasi hozircha shuncha qismga ortiqcha ko‘rinishi mumkin.`}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#080b10]">
        <div className="flex min-w-max items-stretch p-3 sm:p-4">
        {formulaItems.map((item, index) => (
          <div key={item.label} className={cn("relative w-[164px] shrink-0 rounded-xl px-3.5 py-3.5", item.result ? "border border-[#22c55e]/35 bg-[#22c55e]/10" : "bg-[#111827]", index > 0 && "ml-7")}>
            {item.op && (
              <span className={cn("absolute -left-6 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold", item.op === "+" ? "bg-[#22c55e]/15 text-[#4ade80]" : item.op === "=" ? "bg-[#38bdf8]/15 text-[#7dd3fc]" : "bg-[#ef4444]/15 text-[#fca5a5]")}>
                {item.op}
              </span>
            )}
            <p className="text-[11px] font-medium leading-4 text-[#94a3b8]">{item.label}</p>
            {loading ? <div className="mt-2 h-6 w-28 animate-pulse rounded bg-[#1e293b]" /> : (
              <p className={cn("mt-1.5 text-[15px] font-bold tabular-nums", item.tone)}>{formatSum(item.value)}</p>
            )}
            <p className="mt-1 text-[10px] leading-4 text-[#64748b]">{item.hint}</p>
          </div>
        ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#263041] bg-[#0b1018] px-5 py-3 text-[11px] leading-5 text-[#64748b] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#38bdf8]" />
          <p>TO_WITHDRAW ichida avval bankka o‘tkazilgan pul qayta qo‘shilmaydi. Shu sabab bir summa ikki marta sanalmaydi.</p>
        </div>
        <p className="shrink-0 text-[#475569]">Oxirgi hisob: {data?.calculatedAt ? new Date(data.calculatedAt).toLocaleString("uz-UZ") : "—"}</p>
      </div>
    </section>
  );
}

function SmartupProfitSection({
  period,
  usdRate,
  loading,
}: {
  period?: { dateFrom: number; dateTo: number; revenue: number; costUsd: number; orders: number; unitsSold: number; coverage: { costedQty: number; totalSoldQty: number } };
  usdRate: number;
  loading: boolean;
}) {
  const periodCost = (period?.costUsd || 0) * usdRate;
  const periodProfit = (period?.revenue || 0) - periodCost;
  const coverage = period?.coverage.totalSoldQty
    ? Math.round((period.coverage.costedQty / period.coverage.totalSoldQty) * 100)
    : 100;

  const Row = ({ title, subtitle, first, second, result }: { title: string; subtitle: string; first: { label: string; value: number }; second: { label: string; value: number }; result: { label: string; value: number } }) => (
    <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[190px_1fr] lg:items-center">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#64748b]">{subtitle}</p>
      </div>
      <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1.1fr]">
        <div className="rounded-xl bg-[#111827] p-4"><p className="text-[11px] text-[#94a3b8]">{first.label}</p><p className="mt-1 text-lg font-bold tabular-nums text-[#f8fafc]">{loading ? "—" : formatSum(first.value)}</p></div>
        <div className="hidden items-center text-lg font-bold text-[#f87171] sm:flex">−</div>
        <div className="rounded-xl bg-[#111827] p-4"><p className="text-[11px] text-[#94a3b8]">{second.label}</p><p className="mt-1 text-lg font-bold tabular-nums text-[#fbbf24]">{loading ? "—" : formatSum(second.value)}</p></div>
        <div className="hidden items-center text-lg font-bold text-[#7dd3fc] sm:flex">=</div>
        <div className="rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 p-4"><p className="text-[11px] text-[#cbd5e1]">{result.label}</p><p className={cn("mt-1 text-xl font-bold tabular-nums", result.value >= 0 ? "text-[#7dd3fc]" : "text-[#f87171]")}>{loading ? "—" : formatSum(result.value)}</p></div>
      </div>
    </div>
  );

  return <section className="overflow-hidden rounded-[20px] border border-[#263041] bg-[#0d1117]">
    <div className="flex flex-col justify-between gap-3 border-b border-[#263041] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#38bdf8]/12"><CircleDollarSign className="h-5 w-5 text-[#7dd3fc]" /></div><div><h2 className="text-base font-semibold text-white">Smartup bo‘yicha foyda</h2><p className="mt-0.5 text-xs text-[#64748b]">Sotuv puli va mahsulot tannarxi bir joyda</p></div></div>
      <div className="text-right text-[11px] text-[#64748b]"><p>{period ? `${formatDate(period.dateFrom)} — ${formatDate(period.dateTo)}` : "Tanlangan davr"}</p><p className={coverage < 100 ? "text-[#fbbf24]" : "text-[#4ade80]"}>Tannarx kiritilishi: {coverage}%</p></div>
    </div>
    <Row title="Tanlangan davr" subtitle={`${period?.orders || 0} ta order · ${period?.unitsSold || 0} dona sotilgan`} first={{ label: "SellerProfit", value: period?.revenue || 0 }} second={{ label: "Sotilgan mahsulot tannarxi", value: periodCost }} result={{ label: "Davrdagi foyda", value: periodProfit }} />
    <div className="border-t border-[#263041] bg-[#0b1018] px-5 py-3 text-[11px] leading-5 text-[#64748b]">Tannarxi kiritilmagan mahsulot foydani kattaroq ko‘rsatishi mumkin. “Mahsulotlar” sahifasida barcha Smartup tannarxlarini to‘ldiring.</div>
  </section>;
}

function SupplierPaymentsSection({ dateFrom, dateTo }: { dateFrom?: number; dateTo?: number }) {
  const { data, isLoading, create, update, remove } = useSupplierPayments(dateFrom, dateTo);
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Bank");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<SupplierPaymentEntry | null>(null);

  const reset = () => { setSupplierName(""); setAmount(""); setOccurredAt(new Date().toISOString().slice(0, 10)); setPaymentMethod("Bank"); setReference(""); setNote(""); setEditing(null); };
  const submit = async () => {
    const parsedAmount = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!supplierName.trim()) return toast.error("Ta’minotchi nomini kiriting.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("To‘g‘ri summa kiriting.");
    const payload = { supplierName: supplierName.trim(), amount: parsedAmount, occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(), paymentMethod, reference: reference.trim() || undefined, note: note.trim() || undefined };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(editing ? "Ta’minotchi to‘lovi yangilandi." : "Ta’minotchi to‘lovi saqlandi.");
      reset();
    } catch (error: any) { toast.error(error?.response?.data?.message || "To‘lovni saqlab bo‘lmadi."); }
  };
  const startEdit = (entry: SupplierPaymentEntry) => { setEditing(entry); setSupplierName(entry.supplierName); setAmount(String(entry.amount)); setOccurredAt(new Date(entry.occurredAt).toISOString().slice(0, 10)); setPaymentMethod(entry.paymentMethod || "Bank"); setReference(entry.reference || ""); setNote(entry.note || ""); };
  const deleteEntry = async (entry: SupplierPaymentEntry) => {
    if (!confirm(`${entry.supplierName} uchun ${formatSum(entry.amount)} to‘lov o‘chirilsinmi?`)) return;
    try { await remove.mutateAsync(entry.id); if (editing?.id === entry.id) reset(); toast.success("To‘lov o‘chirildi."); } catch (error: any) { toast.error(error?.response?.data?.message || "To‘lovni o‘chirib bo‘lmadi."); }
  };

  return <section className="overflow-hidden rounded-[20px] border border-[#263041] bg-[#0d1117]">
    <div className="flex flex-col justify-between gap-4 border-b border-[#263041] px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#a78bfa]/12"><Building2 className="h-5 w-5 text-[#c4b5fd]" /></div><div><h2 className="text-base font-semibold text-white">Ta’minotchilarga to‘lovlar</h2><p className="mt-0.5 text-xs text-[#64748b]">Kimga, qachon va qancha pul berganingiz</p></div></div><div className="sm:text-right"><p className="text-[11px] text-[#64748b]">Tanlangan davrda jami</p><p className="text-xl font-bold tabular-nums text-[#c4b5fd]">{formatSum(data?.total || 0)}</p></div></div>
    <div className="grid xl:grid-cols-[.82fr_1.18fr]">
      <div className="border-b border-[#263041] p-5 xl:border-b-0 xl:border-r sm:p-6">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">{editing ? "To‘lovni tahrirlash" : "Yangi to‘lov kiritish"}</h3>{editing && <button onClick={reset} className="text-xs text-[#94a3b8] hover:text-white">Bekor qilish</button>}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] text-[#94a3b8] sm:col-span-2">Ta’minotchi nomi<input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Masalan: Anvar Plast" className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
          <label className="text-[11px] text-[#94a3b8]">Berilgan summa<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5 000 000" className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
          <label className="text-[11px] text-[#94a3b8]">Sana<input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
          <label className="text-[11px] text-[#94a3b8]">To‘lov usuli<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]"><option>Bank</option><option>Karta</option><option>Naqd</option><option>Boshqa</option></select></label>
          <label className="text-[11px] text-[#94a3b8]">Hujjat / operatsiya raqami<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ixtiyoriy" className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
          <label className="text-[11px] text-[#94a3b8] sm:col-span-2">Izoh<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nima uchun berildi?" className="mt-1.5 w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
        </div>
        <button onClick={submit} disabled={create.isPending || update.isPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Plus className="h-4 w-4" />{editing ? "O‘zgarishni saqlash" : "To‘lovni saqlash"}</button>
        <p className="mt-3 text-[10px] leading-4 text-[#64748b]">Bu kassa tarixi. Smartup tannarxi foydadan allaqachon ayrilgani uchun bu summa foydadan yana ayirilmaydi.</p>
      </div>
      <div>
        {isLoading ? <div className="grid h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#a78bfa]" /></div> : !data?.entries.length ? <div className="grid h-48 place-items-center px-6 text-center text-sm text-[#64748b]">Hozircha ta’minotchiga to‘lov kiritilmagan.</div> : <div className="divide-y divide-[#1e293b]">{data.entries.map((entry) => <div key={entry.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[110px_1fr_auto] sm:items-center"><div><p className="text-xs text-[#94a3b8]">{formatDate(entry.occurredAt)}</p><p className="mt-1 text-[10px] text-[#64748b]">{entry.paymentMethod || "—"}</p></div><div className="min-w-0"><p className="text-sm font-semibold text-white">{entry.supplierName}</p><p className="mt-1 truncate text-[11px] text-[#64748b]">{[entry.reference, entry.note].filter(Boolean).join(" · ") || "Izoh yo‘q"}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><p className="text-sm font-bold tabular-nums text-[#c4b5fd]">{formatSum(entry.amount)}</p><div className="flex gap-1"><button onClick={() => startEdit(entry)} aria-label="Tahrirlash" className="grid h-8 w-8 place-items-center rounded-lg text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => deleteEntry(entry)} aria-label="O‘chirish" className="grid h-8 w-8 place-items-center rounded-lg text-[#64748b] hover:bg-[#ef4444]/10 hover:text-[#f87171]"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>)}</div>}
      </div>
    </div>
  </section>;
}

type LedgerTab = "logistics" | "marketing" | "storage" | "extensions" | "fines" | "other" | "refunds";

function ExpenseAuditLedger({ data, loading }: { data?: LogisticsFinesResponse; loading: boolean }) {
  const [tab, setTab] = useState<LedgerTab>("fines");
  const [visibleCount, setVisibleCount] = useState(20);
  const tabs: Array<{ id: LedgerTab; label: string; items: Array<{ id: string; amount: number; source: string; description: string; date: number | null; status: string }>; total: number; color: string }> = [
    { id: "logistics", label: "Logistika", items: data?.logistics || [], total: data?.logisticsTotal || 0, color: "#fb923c" },
    { id: "marketing", label: "Marketing", items: data?.marketing || [], total: data?.marketingTotal || 0, color: "#f472b6" },
    { id: "storage", label: "Saqlash", items: data?.storage || [], total: data?.storageTotal || 0, color: "#fbbf24" },
    { id: "extensions", label: "Uzaytirish", items: data?.extensions || [], total: data?.extensionTotal || 0, color: "#c084fc" },
    { id: "fines", label: "Qolgan jarimalar", items: data?.fines || [], total: data?.finesTotal || 0, color: "#f87171" },
    { id: "other", label: "Boshqa xizmatlar", items: data?.other || [], total: data?.otherTotal || 0, color: "#fbbf24" },
    { id: "refunds", label: "Qaytarimlar", items: data?.refunds || [], total: data?.refundsTotal || 0, color: "#34d399" },
  ];
  const active = tabs.find((item) => item.id === tab)!;
  const visible = active.items.slice(0, visibleCount);

  return <section className="overflow-hidden rounded-2xl border border-[#262632] bg-[#0f0f16]">
    <div className="border-b border-[#262632] p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div><h2 className="text-base font-semibold text-white">Ushlanmalar tafsiloti</h2><p className="mt-1 text-xs text-[#71717a]">Har bir summa Uzumning finance/expenses yozuvidan; jarima sababi matni bilan ko‘rsatiladi.</p></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">{tabs.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setVisibleCount(20); }} className={cn("whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition", tab === item.id ? "border-[#3f3f46] bg-[#27272a] text-white" : "border-transparent bg-[#18181b] text-[#71717a] hover:text-white")}>{item.label} <span className="ml-1 tabular-nums" style={{ color: item.color }}>{item.items.length}</span></button>)}</div>
      </div>
    </div>
    <div className="flex items-center justify-between border-b border-[#262632] bg-[#111118] px-4 py-3 sm:px-5"><p className="text-xs text-[#71717a]">{active.label} jami</p><p className="text-base font-semibold tabular-nums" style={{ color: active.color }}>{tab === "refunds" ? "+ " : "− "}{formatSum(active.total)}</p></div>
    {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#8b5cf6]" /></div> : !active.items.length ? <div className="flex h-40 items-center justify-center text-sm text-[#71717a]">Bu turdagi yozuv topilmadi</div> : <div className="divide-y divide-[#1c1c24]">{visible.map((item) => <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[105px_1fr_140px] sm:items-center sm:px-5"><div className="text-[11px] text-[#71717a]">{formatDate(item.date)}<p className="mt-0.5 text-[9px] text-[#52525b]">{item.status}</p></div><div className="min-w-0"><p className="text-xs leading-5 text-[#d4d4d8]" title={item.description}>{item.description || item.source}</p><p className="mt-0.5 text-[10px] text-[#52525b]">{item.source}</p></div><p className="text-sm font-semibold tabular-nums sm:text-right" style={{ color: active.color }}>{tab === "refunds" ? "+ " : "− "}{formatSum(item.amount)}</p></div>)}</div>}
    {visibleCount < active.items.length && <button onClick={() => setVisibleCount((count) => count + 20)} className="w-full border-t border-[#262632] px-4 py-3 text-xs text-[#a1a1aa] hover:bg-[#18181b] hover:text-white">Yana {Math.min(20, active.items.length - visibleCount)} ta ko‘rsatish</button>}
  </section>;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [exporting, setExporting] = useState(false);

  // Currency display: drive formatSum() across the whole page. Set synchronously
  // during render so child components format in the chosen currency this pass.
  const { usdRate, displayCurrency } = useDashboardStore();
  setMoneyDisplay(displayCurrency, usdRate);

  // Slim mode: only logistics + fines totals from /v1/finance/expenses.
  // `refresh()` bypasses the 5-min backend cache (sends ?force=1).
  const { data, isLoading, isFetching, refresh, error } = useLogisticsAndFines();

  // Top-of-page: PROCESSING + TO_WITHDRAW sums from /v1/finance/orders
  const {
    data: pwData,
    isLoading: pwLoading,
    isFetching: pwFetching,
    refresh: refreshPw,
  } = useProcessingAndWithdraw();

  // ── Logistika/Jarimalar kartasi uchun davr filtri (client-side) ──
  // null = Hammasi. Filtr faqat shu kartaga va Excel eksportga ta'sir qiladi.
  const [logFilter, setLogFilter] = useState<LogRange>(null);
  const reportRange = useMemo(() => ({
    dateFrom: logFilter?.from ?? DEFAULT_FROM_MS,
    dateTo: logFilter?.to ?? todayEndMs(),
  }), [logFilter]);
  const {
    data: periodData,
    isLoading: periodLoading,
    isFetching: periodFetching,
    refresh: refreshPeriod,
  } = useDashboardSummary("year", reportRange);
  const lf = useMemo(() => {
    const inRange = (ms: number | null) => {
      if (!logFilter) return true;
      if (ms == null) return false;
      return ms >= logFilter.from && ms <= logFilter.to;
    };
    const pick = <T extends { date: number | null; amount: number }>(arr: T[] = []) => arr.filter((x) => inRange(x.date));
    const sum = (arr: Array<{ amount: number }>) => arr.reduce((s, x) => s + x.amount, 0);
    const logistics = pick(data?.logistics);
    const fines = pick(data?.fines);
    const marketing = pick(data?.marketing);
    const storage = pick(data?.storage);
    const extensions = pick(data?.extensions);
    const other = pick(data?.other);
    const refunds = pick(data?.refunds);
    return {
      logistics, fines, marketing, storage, extensions, other, refunds,
      logisticsTotal: sum(logistics), finesTotal: sum(fines),
      marketingTotal: sum(marketing), storageTotal: sum(storage), extensionTotal: sum(extensions),
      otherTotal: sum(other), refundsTotal: sum(refunds),
    };
  }, [data, logFilter]);

  const filteredExpenses = useMemo<LogisticsFinesResponse | undefined>(() => data ? ({
    ...data,
    logistics: lf.logistics,
    logisticsTotal: lf.logisticsTotal,
    logisticsCount: lf.logistics.length,
    fines: lf.fines,
    finesTotal: lf.finesTotal,
    finesCount: lf.fines.length,
    marketing: lf.marketing,
    marketingTotal: lf.marketingTotal,
    marketingCount: lf.marketing.length,
    storage: lf.storage,
    storageTotal: lf.storageTotal,
    storageCount: lf.storage.length,
    extensions: lf.extensions,
    extensionTotal: lf.extensionTotal,
    extensionCount: lf.extensions.length,
    other: lf.other,
    otherTotal: lf.otherTotal,
    otherCount: lf.other.length,
    refunds: lf.refunds,
    refundsTotal: lf.refundsTotal,
    refundsCount: lf.refunds.length,
    combined: lf.logisticsTotal + lf.finesTotal + lf.marketingTotal + lf.storageTotal + lf.extensionTotal + lf.otherTotal,
  }) : undefined, [data, lf]);

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportFinanceXlsx({
        dateFrom: logFilter?.from ?? DEFAULT_FROM_MS,
        dateTo: logFilter?.to ?? todayEndMs(),
        logistics: lf.logistics.map((x) => ({
          description: x.description,
          amount: x.amount,
          date: x.date,
          status: x.status,
          type: x.source,
        })),
        fines: lf.fines.map((x) => ({
          description: x.description,
          amount: x.amount,
          date: x.date,
          status: x.status,
          type: x.source,
        })),
        marketing: lf.marketing.map((x) => ({ description: x.description, amount: x.amount, date: x.date, status: x.status, type: x.source })),
        storage: lf.storage.map((x) => ({ description: x.description, amount: x.amount, date: x.date, status: x.status, type: x.source })),
        extensions: lf.extensions.map((x) => ({ description: x.description, amount: x.amount, date: x.date, status: x.status, type: x.source })),
        other: lf.other.map((x) => ({ description: x.description, amount: x.amount, date: x.date, status: x.status, type: x.source })),
        refunds: lf.refunds.map((x) => ({ description: x.description, amount: x.amount, date: x.date, status: x.status, type: x.source })),
        totalLogistics: lf.logisticsTotal,
        totalFines: lf.finesTotal,
        totalMarketing: lf.marketingTotal,
        totalStorage: lf.storageTotal,
        totalExtensions: lf.extensionTotal,
        totalOther: lf.otherTotal,
        totalRefunds: lf.refundsTotal,
      });
      toast.success("Excel fayli yuklab olindi");
    } catch (err: any) {
      toast.error(`Excel yaratib bo'lmadi: ${err?.message || "noma'lum xato"}`);
    } finally {
      setExporting(false);
    }
  };

  const isFirstLoad = isLoading && !data;
  const errMsg = (error as any)?.response?.data?.message || (error as any)?.message;
  const errCode = (error as any)?.code;
  const isTimeout = errCode === "ECONNABORTED" || (typeof errMsg === "string" && /timeout/i.test(errMsg));
  const isRateLimited = typeof errMsg === "string" && /rate|limit|429/i.test(errMsg);
  const isForbidden = typeof errMsg === "string" && /ruxsat|forbid|403|RBAC|access denied/i.test(errMsg);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Moliya"
        subtitle={data
          ? `${data.totalExpenses} ta Uzum moliyaviy yozuvi tekshirildi`
          : "Balans, jarayondagi tannarx va barcha ushlanmalar"}
        action={
          <button
            onClick={() => { refresh(); refreshPw(); refreshPeriod(); }}
            disabled={isFetching || pwFetching || periodFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#a1a1aa] hover:text-white hover:border-[#27272a] transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isFetching || pwFetching || periodFetching) && "animate-spin")} />
            <span className="hidden md:inline">{(isFetching || pwFetching || periodFetching) ? "Yangilanmoqda..." : "Yangilash"}</span>
          </button>
        }
      />

      {/* First-time fetch banner */}
      {isFirstLoad && (
        <div className="rounded-2xl bg-[#06b6d4]/10 border border-[#06b6d4]/20 p-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-[#06b6d4] mt-0.5 flex-shrink-0 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#06b6d4]">Uzum API'dan ma'lumot olinmoqda</p>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              /v1/finance/expenses dan xarajatlarni olib, Logistika va Jarimalarni hisoblayapmiz. 5 daqiqa davomida cache'dan tez yuklanadi.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#ef4444] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#ef4444]">
              {isTimeout
                ? "Vaqt tugadi (timeout)"
                : isRateLimited
                  ? "Uzum API limiti tugadi"
                  : isForbidden
                    ? "Uzum Finance API ruxsati yo'q"
                    : "Ma'lumot olinmadi"}
            </p>
            {isForbidden ? (
              <div className="text-xs text-[#a1a1aa] mt-1 space-y-1">
                <p>API kalitingiz <code className="px-1 py-0.5 rounded bg-[#18181b] text-white">finance</code> endpointlariga ruxsatga ega emas.</p>
                <p className="text-[#71717a]">
                  Tuzatish: Uzum Seller panel → <b>Sozlamalar → API integratsiya</b> → kalitni tahrirlash → <b>Finance</b> ruxsatini yoqing → saqlang. So'ng bu sahifani qayta yuklang.
                </p>
              </div>
            ) : isTimeout ? (
              <div className="text-xs text-[#a1a1aa] mt-1 space-y-1">
                <p>Birinchi yuklash Uzum rate-limit sababli 1-3 daqiqa olishi mumkin.</p>
                <p className="text-[#71717a]">"Qayta urinish" tugmasini bosing — backend keshlash boshlangani uchun ikkinchi marta tez bo'ladi.</p>
              </div>
            ) : (
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                {isRateLimited
                  ? "Bugun juda ko'p so'rov yuborildi. Bir oz kutib, qayta urinib ko'ring (yoki ertaga)."
                  : errMsg || "Uzum API'dan javob kelmadi"}
              </p>
            )}
          </div>
          <button
            onClick={() => { refresh(); refreshPw(); refreshPeriod(); }}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#ef4444]/15 hover:bg-[#ef4444]/25 text-[#ef4444] text-xs font-semibold transition-colors"
          >
            Qayta urinish
          </button>
        </div>
      )}

      <FinanceAuditOverview data={pwData} expenses={data} usdRate={usdRate} loading={pwLoading || isLoading} />

      {/* Davr filtri — faqat Logistika va Jarimalar kartasiga ta'sir qiladi */}
      <LogFinesFilterBar value={logFilter} onChange={setLogFilter} />

      <SmartupProfitSection period={periodData} usdRate={usdRate} loading={periodLoading || pwLoading || isLoading} />

      <div className="flex justify-end">
        <button onClick={handleExport} disabled={!data || isLoading || exporting} className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          {exporting ? "Excel tayyorlanmoqda..." : "Tanlangan davrni Excelga yuklash"}
        </button>
      </div>

      <ExpenseAuditLedger data={filteredExpenses} loading={isLoading} />

      <ManualWithdrawalsDatabaseSection dateFrom={logFilter?.from} dateTo={logFilter?.to} />

      <SupplierPaymentsSection dateFrom={logFilter?.from} dateTo={logFilter?.to} />

      {/* Boshqa moliya bo'limlari vaqtinchalik o'chirilgan — faqat Logistika + Jarimalar */}
    </div>
  );
}
