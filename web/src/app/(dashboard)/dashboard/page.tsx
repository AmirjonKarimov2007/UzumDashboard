"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  Star,
  ChevronRight,
  Loader2,
  AlertCircle,
  Calendar,
  X,
  RotateCcw,
  AlertTriangle,
  Percent,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { RevenueAreaChart } from "@/components/charts/area-chart";
import { DonutChart, DonutLegend } from "@/components/charts/donut-chart";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { useDashboardSummary } from "@/hooks/use-finance";
import { useReturnsAnalytics, type ReturnsFilters } from "@/hooks/use-returns";
import { useSyncStatus } from "@/hooks/use-sync";
import { useDashboardStore } from "@/stores/dashboard-store";
import { formatMoney, usdToUzs } from "@/lib/currency";
import Link from "next/link";

const timeRanges = [
  { id: "today",   label: "Bugun" },
  { id: "week",    label: "Hafta" },
  { id: "month",   label: "Oy" },
  { id: "quarter", label: "3 oy" },
  { id: "year",    label: "Yil" },
];

function NoDataState({ onConnect }: { onConnect?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[#3f3f46]" />
      </div>
      <p className="text-sm font-semibold text-white mb-1">Ma'lumot yo'q</p>
      <p className="text-xs text-[#52525b] mb-4 max-w-xs">
        Uzum API ulangandan so'ng ma'lumotlar avtomatik yuklanadi
      </p>
      <Link
        href="/settings"
        className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-medium"
      >
        <Sparkles className="w-3.5 h-3.5" />
        API ulash
      </Link>
    </div>
  );
}

/** yyyy-mm-dd (input qiymati) ni shu kun boshi/oxiri ms ga aylantiradi. */
function dayStartMs(s: string): number { return new Date(`${s}T00:00:00`).getTime(); }
function dayEndMs(s: string): number { return new Date(`${s}T23:59:59.999`).getTime(); }
/** ms → yyyy-mm-dd (input uchun, mahalliy vaqt bo'yicha). */
function toInputDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** ms → DD.MM.YYYY (ko'rsatish uchun). */
function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState("today");
  // Custom sana oralig'i — tanlansa preset chiplarni inkor qiladi.
  const [custom, setCustom] = useState<{ dateFrom: number; dateTo: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const { data: summary, isLoading: summaryLoading, isFetching: summaryFetching, refresh: refreshSummary } = useDashboardSummary(timeRange, custom);
  const { data: syncStatus } = useSyncStatus();

  const isConnected = syncStatus?.isConnected;

  const { usdRate, displayCurrency } = useDashboardStore();
  const fmtMoney = (n: number) => formatMoney(n, displayCurrency, usdRate);

  // ── Vidjet ma'lumotlari (summary'dan, davr/sana bo'yicha) ──
  // Daromad dinamikasi: profit = revenue − (costUsd → so'm joriy kurs bo'yicha)
  const chartData = (summary?.chart ?? []).map((c) => ({
    name: c.name,
    value: c.revenue,
    revenue: c.revenue,
    profit: Math.round(c.revenue - usdToUzs(c.costUsd, usdRate)),
  }));
  const topProducts = summary?.topProducts ?? [];
  const recentOrders = summary?.recentOrders ?? [];

  // ── Qaytarishlar (returns) — tanlangan davr bo'yicha, dashboard kabi ──
  const returnsFilters: ReturnsFilters = useMemo(() => {
    if (custom) return { dateFrom: custom.dateFrom, dateTo: custom.dateTo };
    const now = Date.now();
    const presetDays: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
    if (timeRange === "today") return { dateFrom: dayStartMs(toInputDate(now)), dateTo: dayEndMs(toInputDate(now)) };
    const days = presetDays[timeRange];
    if (days) return { dateFrom: dayStartMs(toInputDate(now - (days - 1) * 86400000)), dateTo: now };
    return {};
  }, [timeRange, custom]);
  const { data: returnsData, isLoading: returnsLoading } = useReturnsAnalytics(returnsFilters);
  const ra = returnsData?.analytics;

  const revenue = summary?.revenue ?? 0;                       // UZS
  const costUzs = usdToUzs(summary?.costUsd ?? 0, usdRate);    // tan narx → so'm (joriy kurs)
  const netProfit = revenue - costUzs;                        // Sof foyda (UZS)
  // Sof foyda marjasi (daromadga nisbatan) — trend rozetkasida ko'rsatamiz
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
  const coverage = summary?.coverage;
  // Tan narx kiritilmagan sotuvlar bo'lsa, sof foyda taxminiy
  const costIncomplete = !!coverage && coverage.costedQty < coverage.totalSoldQty;
  // Tanlangan davr uchun "Buyurtmalar" izohi
  const rangeLabel: Record<string, string> = {
    today: "bugun tushgan",
    week: "oxirgi 7 kun",
    month: "oxirgi 30 kun",
    quarter: "oxirgi 3 oy",
    year: "oxirgi 1 yil",
  };
  const ordersHint = custom
    ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}`
    : rangeLabel[timeRange] || "tanlangan davrda";

  const todayInput = toInputDate(Date.now());

  // Preset chip tanlash — custom oraliqni bekor qiladi.
  const selectPreset = (id: string) => { setCustom(null); setPickerOpen(false); setTimeRange(id); };
  // Custom sana picker'ini ochish — joriy oraliq bilan to'ldiramiz.
  const openPicker = () => {
    const now = Date.now();
    setDraftFrom(toInputDate(custom?.dateFrom ?? now));
    setDraftTo(toInputDate(custom?.dateTo ?? now));
    setPickerOpen((o) => !o);
  };
  // Boshlanish sanasi o'zgarsa — agar tugash undan oldin/bo'sh bo'lsa, tenglashtiramiz.
  const onChangeFrom = (v: string) => {
    setDraftFrom(v);
    if (!draftTo || draftTo < v) setDraftTo(v);
  };
  // Tugash sanasi o'zgarsa — agar boshlanish undan keyin bo'lsa, tenglashtiramiz.
  const onChangeTo = (v: string) => {
    setDraftTo(v);
    if (draftFrom && v < draftFrom) setDraftFrom(v);
  };
  // Custom oraliqni qo'llash — kerak bo'lsa avtomatik almashtiramiz (from ≤ to).
  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const a = dayStartMs(draftFrom);
    const b = dayEndMs(draftTo);
    setCustom({ dateFrom: Math.min(a, b), dateTo: Math.max(a, b) });
    setPickerOpen(false);
  };
  // Tezkor tanlovlar.
  const applyQuick = (fromMs: number, toMs: number) => {
    setCustom({ dateFrom: fromMs, dateTo: toMs });
    setPickerOpen(false);
  };
  const quickToday = () => { const d = new Date(); applyQuick(dayStartMs(toInputDate(d.getTime())), dayEndMs(toInputDate(d.getTime()))); };
  const quickYesterday = () => { const d = new Date(Date.now() - 86400000); const s = toInputDate(d.getTime()); applyQuick(dayStartMs(s), dayEndMs(s)); };
  const quick7 = () => { applyQuick(dayStartMs(toInputDate(Date.now() - 6 * 86400000)), dayEndMs(todayInput)); };

  const metricCards = [
    {
      title: "Jami daromad",
      value: fmtMoney(revenue),
      rawValue: revenue,
      change: 0,
      changeLabel: "FBS sotuvlardan (sellerProfit)",
      icon: DollarSign,
      gradient: "from-[#8b5cf6] to-[#6d28d9]",
      color: "#8b5cf6",
      sparkline: [],
    },
    {
      title: "Buyurtmalar",
      value: summary?.orders ?? 0,
      rawValue: summary?.orders ?? 0,
      change: 0,
      changeLabel: ordersHint,
      icon: ShoppingCart,
      gradient: "from-[#3b82f6] to-[#1d4ed8]",
      color: "#3b82f6",
      sparkline: [],
    },
    {
      title: "Mahsulotlar",
      value: summary?.activeProducts ?? 0,
      rawValue: summary?.activeProducts ?? 0,
      change: 0,
      changeLabel: "faol mahsulotlar",
      icon: Package,
      gradient: "from-[#10b981] to-[#059669]",
      color: "#10b981",
      sparkline: [],
    },
    {
      title: "Sof foyda",
      value: fmtMoney(netProfit),
      rawValue: netProfit,
      change: margin,
      changeLabel: costIncomplete ? "marja · tan narx to'liq emas" : "marja · daromad − tan narx",
      icon: TrendingUp,
      gradient: "from-[#f59e0b] to-[#d97706]",
      color: "#f59e0b",
      sparkline: [],
    },
  ];

  const donutData = (summary?.categories ?? []).map((c, i: number) => ({
    name: c.name,
    value: Math.round(c.percentage),
    color: ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#71717a"][i % 6],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bosh sahifa"
        subtitle={fmtDate(Date.now())}
      />

      {/* Time range + custom date + sync */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f0f16] border border-[#1c1c24]">
            {timeRanges.map((r) => (
              <button
                key={r.id}
                onClick={() => selectPreset(r.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  !custom && timeRange === r.id
                    ? "bg-[#8b5cf6] text-white shadow-sm"
                    : "text-[#71717a] hover:text-white"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Custom sana oralig'i */}
          <div className="relative">
            <button
              onClick={openPicker}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                custom
                  ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                  : "bg-[#0f0f16] border-[#1c1c24] text-[#71717a] hover:text-white hover:border-[#27272a]"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              {custom ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}` : "Sana tanlash"}
              {custom && (
                <X
                  className="w-3.5 h-3.5 ml-0.5 opacity-80 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setCustom(null); setPickerOpen(false); }}
                />
              )}
            </button>

            {pickerOpen && (
              <>
                {/* tashqariga bosilganda yopish */}
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-20 w-72 p-4 rounded-xl bg-[#0f0f16] border border-[#27272a] shadow-xl">
                  <div className="space-y-3">
                    {/* Tezkor tanlovlar */}
                    <div className="flex items-center gap-1.5">
                      <button onClick={quickToday} className="flex-1 px-2 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:border-[#8b5cf6]/50 transition-all">Bugun</button>
                      <button onClick={quickYesterday} className="flex-1 px-2 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:border-[#8b5cf6]/50 transition-all">Kecha</button>
                      <button onClick={quick7} className="flex-1 px-2 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:border-[#8b5cf6]/50 transition-all">7 kun</button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#71717a] mb-1">Boshlanish sanasi</label>
                      <input
                        type="date"
                        value={draftFrom}
                        max={todayInput}
                        onChange={(e) => onChangeFrom(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#71717a] mb-1">Tugash sanasi</label>
                      <input
                        type="date"
                        value={draftTo}
                        max={todayInput}
                        onChange={(e) => onChangeTo(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={applyCustom}
                        disabled={!draftFrom || !draftTo}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] transition-all disabled:opacity-40"
                      >
                        Qo'llash
                      </button>
                      <button
                        onClick={() => setPickerOpen(false)}
                        className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-[#71717a] hover:text-white transition-all"
                      >
                        Bekor
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => refreshSummary()}
          disabled={summaryFetching || !isConnected}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#71717a] hover:text-white hover:border-[#27272a] transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", summaryFetching && "animate-spin")} />
          Yangilash
        </button>
      </div>

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {[1,2,3,4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] animate-pulse" />
          ))}
        </div>
      ) : !isConnected ? (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24]">
          <NoDataState />
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {metricCards.map((card, i) => (
            <MetricCard key={card.title} data={card} index={i} />
          ))}
        </div>
      )}

      {/* Charts row */}
      {isConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-2 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Daromad dinamikasi</h2>
                <p className="text-xs text-[#52525b] mt-0.5">Daromad va sof foyda</p>
              </div>
            </div>
            {summaryFetching && !summary ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#52525b] animate-spin" />
              </div>
            ) : chartData.length ? (
              <RevenueAreaChart
                data={chartData}
                primaryKey="revenue"
                secondaryKey="profit"
                primaryLabel="Daromad"
                secondaryLabel="Sof foyda"
                formatter={(v) => fmtMoney(v)}
              />
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-[#52525b]">
                Bu davrda ma'lumot yo'q
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
          >
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-white">Kategoriyalar</h2>
              <p className="text-xs text-[#52525b] mt-0.5">Daromad bo'yicha</p>
            </div>
            <DonutChart
              data={donutData}
              innerLabel="Jami"
              innerValue="100%"
            />
            <DonutLegend data={donutData} />
          </motion.div>
        </div>
      )}

      {/* Qaytarishlar tahlili — tanlangan davr bo'yicha */}
      {isConnected && (
        <ReturnsWidget
          ra={ra}
          loading={returnsLoading}
          periodLabel={ordersHint}
          fmtMoney={fmtMoney}
          fmtCostUsd={(usd) => fmtMoney(usdToUzs(usd, usdRate))}
        />
      )}

      {/* Bottom row: Top products + Recent orders */}
      {isConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top products */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#18181b] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Top mahsulotlar</h2>
              <Link href="/products" className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] flex items-center gap-1">
                Barchasini ko'r <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {topProducts?.slice(0, 5).map((p: any, i: number) => {
                const maxRevenue = topProducts[0]?.revenue || 1;
                const pct = Math.round((Number(p.revenue) / Number(maxRevenue)) * 100);
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#3f3f46] w-4">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{p.name}</p>
                      <div className="mt-1 h-1 rounded-full bg-[#18181b] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-[#8b5cf6]"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                        />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-white tabular-nums">{fmtMoney(Number(p.revenue))}</p>
                      <p className="text-[10px] text-[#52525b]">{p.soldCount} ta</p>
                    </div>
                  </div>
                );
              })}
              {!topProducts?.length && (
                <p className="text-xs text-[#52525b] text-center py-4">Mahsulotlar yo'q</p>
              )}
            </div>
          </motion.div>

          {/* Recent orders */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#18181b] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">So'nggi buyurtmalar</h2>
              <Link href="/orders" className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] flex items-center gap-1">
                Barchasini ko'r <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-[#18181b]">
              {recentOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      Buyurtma #{order.orderId}
                    </p>
                    <p className="text-[11px] text-[#52525b] truncate mt-0.5">
                      {order.name || "—"}{order.sub ? ` ${order.sub}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-white tabular-nums">{fmtMoney(Number(order.total))}</p>
                    {order.status && <StatusBadge status={String(order.status).toLowerCase() as any} />}
                  </div>
                </div>
              ))}
              {!recentOrders?.length && (
                <p className="text-xs text-[#52525b] text-center py-8">Buyurtmalar yo'q</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── Qaytarishlar tahlili widgeti (bosh sahifa) ──────────────────────────────

type ReturnsAnalyticsLite = {
  totalItems: number;
  totalQty: number;
  totalSaleValue: number;
  lostItems: number;
  lostQty: number;
  lostCostUsd: number;
  returnRate: number | null;
  soldQty: number;
  byMonth: Array<{ month: string; qty: number; saleValue: number; lost: number }>;
  mostReturned: Array<{ name: string; sku: string; qty: number; saleValue: number }>;
};

function ReturnsWidget({
  ra,
  loading,
  periodLabel,
  fmtMoney,
  fmtCostUsd,
}: {
  ra: ReturnsAnalyticsLite | undefined;
  loading: boolean;
  periodLabel: string;
  fmtMoney: (n: number) => string;
  fmtCostUsd: (usd: number) => string;
}) {
  const maxMonthQty = Math.max(1, ...(ra?.byMonth ?? []).map((m) => m.qty));

  const kpis = [
    { label: "Qaytarilgan", value: ra ? `${ra.totalItems} ta` : "—", sub: `${ra?.totalQty ?? 0} dona`, icon: RotateCcw, color: "#8b5cf6" },
    { label: "Qaytgan qiymat", value: ra ? fmtMoney(ra.totalSaleValue) : "—", sub: "sotuv narxida", icon: DollarSign, color: "#3b82f6" },
    { label: "Qaytarish foizi", value: ra?.returnRate != null ? `${ra.returnRate.toFixed(1)}%` : "—", sub: ra ? `${ra.soldQty} sotilgan` : "", icon: Percent, color: "#06b6d4" },
    { label: "Yo'qolgan", value: ra ? `${ra.lostItems} ta` : "—", sub: ra ? fmtCostUsd(ra.lostCostUsd) : "", icon: AlertTriangle, color: "#ef4444" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 flex items-center justify-center">
            <RotateCcw className="w-4.5 h-4.5 text-[#a78bfa]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Qaytarishlar tahlili</h2>
            <p className="text-xs text-[#52525b] mt-0.5">{periodLabel}</p>
          </div>
        </div>
        <Link href="/returns" className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] flex items-center gap-1">
          Batafsil <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-[#18181b]/50 border border-[#1c1c24] p-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: `${k.color}18`, border: `1px solid ${k.color}30` }}>
              <k.icon className="w-3.5 h-3.5" style={{ color: k.color }} />
            </div>
            <p className="text-[11px] text-[#52525b]">{k.label}</p>
            {loading ? (
              <div className="h-5 w-14 rounded bg-[#18181b] animate-pulse mt-1" />
            ) : (
              <p className="text-base font-bold text-white truncate" title={String(k.value)}>{k.value}</p>
            )}
            <p className="text-[10px] text-[#52525b] mt-0.5 truncate">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Oylik dinamika + eng ko'p qaytarilgan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <p className="text-xs font-semibold text-white mb-3">Oylar bo'yicha qaytarishlar</p>
          {loading ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 text-[#8b5cf6] animate-spin" /></div>
          ) : ra?.byMonth?.length ? (
            <>
              <div className="flex items-end gap-2 h-28">
                {ra.byMonth.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex flex-col justify-end items-center h-24 relative">
                      <div className="w-full max-w-[34px] rounded-t-md bg-[#8b5cf6]/70 relative" style={{ height: `${(m.qty / maxMonthQty) * 100}%` }}>
                        {m.lost > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 rounded-t-md bg-[#ef4444]" style={{ height: `${(m.lost / m.qty) * 100}%` }} title={`${m.lost} yo'qolgan`} />
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-[#52525b] tabular-nums">{m.qty}</span>
                    <span className="text-[9px] text-[#52525b] whitespace-nowrap">{m.month.slice(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-[#71717a]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6]/70" /> Qaytgan</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Yo'qolgan</span>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-xs text-[#52525b]">Bu davrda qaytarish yo'q</div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-white mb-3">Eng ko'p qaytarilgan</p>
          <div className="space-y-2">
            {(ra?.mostReturned ?? []).slice(0, 4).map((p, i) => (
              <div key={p.sku + i} className="flex items-center gap-2.5">
                <span className="text-[11px] font-bold text-[#3f3f46] w-4">#{i + 1}</span>
                <p className="flex-1 min-w-0 text-xs font-medium text-white truncate" title={p.name}>{p.name}</p>
                <span className="text-xs font-bold text-[#8b5cf6] tabular-nums flex-shrink-0">{p.qty} ta</span>
              </div>
            ))}
            {!loading && !ra?.mostReturned?.length && (
              <p className="text-xs text-[#52525b] text-center py-6">Ma'lumot yo'q</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
