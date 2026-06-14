"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, BarChart3, Activity, Package, ShoppingCart,
  DollarSign, RefreshCw, Calendar, X, Loader2, AlertCircle, Boxes, Layers,
  Eye, Star, Search, Award, Undo2, Warehouse, ArrowDownUp,
} from "lucide-react";
import Link from "next/link";
import { RevenueAreaChart } from "@/components/charts/area-chart";
import { SalesBarChart } from "@/components/charts/bar-chart";
import { DonutChart, DonutLegend } from "@/components/charts/donut-chart";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useDashboardSummary } from "@/hooks/use-finance";
import { useProductAnalytics, type ProductAnalyticsRow } from "@/hooks/use-products";
import { useSyncStatus } from "@/hooks/use-sync";
import { useDashboardStore } from "@/stores/dashboard-store";
import { formatMoney, usdToUzs } from "@/lib/currency";

const timeRanges = [
  { id: "today",   label: "Bugun" },
  { id: "week",    label: "Hafta" },
  { id: "month",   label: "Oy" },
  { id: "quarter", label: "3 oy" },
  { id: "year",    label: "Yil" },
];

const DONUT_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#71717a"];

function dayStartMs(s: string): number { return new Date(`${s}T00:00:00`).getTime(); }
function dayEndMs(s: string): number { return new Date(`${s}T23:59:59.999`).getTime(); }
function toInputDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtNum(n?: number | null): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));
}

function NotConnectedState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[#3f3f46]" />
      </div>
      <p className="text-sm font-semibold text-white mb-1">Uzum API ulanmagan</p>
      <p className="text-xs text-[#52525b] mb-4 max-w-xs">Analitika uchun avval Uzum do'koningizni ulang</p>
      <Link href="/settings" className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-medium">
        API ulash
      </Link>
    </div>
  );
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("month");
  const [custom, setCustom] = useState<{ dateFrom: number; dateTo: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const { data: summary, isLoading, isFetching, refresh } = useDashboardSummary(timeRange, custom);
  const { data: syncStatus } = useSyncStatus();
  const isConnected = syncStatus?.isConnected;

  const { usdRate, displayCurrency } = useDashboardStore();
  const fmtMoney = (n: number) => formatMoney(n, displayCurrency, usdRate);

  // Mahsulotlar analitikasi (umumiy, davrdan mustaqil)
  const pa = useProductAnalytics();
  const refreshAll = () => { refresh(); pa.refresh(); };

  // ── Real ko'rsatkichlar (davr bo'yicha) ──────────────────────────────
  const revenue = summary?.revenue ?? 0;
  const costUzs = usdToUzs(summary?.costUsd ?? 0, usdRate);
  const netProfit = revenue - costUzs;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const orders = summary?.orders ?? 0;
  const unitsSold = summary?.unitsSold ?? 0;
  const activeProducts = summary?.activeProducts ?? 0;
  const aov = orders > 0 ? revenue / orders : 0;
  const perUnit = unitsSold > 0 ? revenue / unitsSold : 0;
  const coverage = summary?.coverage;
  const costIncomplete = !!coverage && coverage.costedQty < coverage.totalSoldQty;

  // Trend grafiklari
  const revChart = (summary?.chart ?? []).map((c) => ({
    name: c.name,
    value: c.revenue,
    revenue: c.revenue,
    profit: Math.round(c.revenue - usdToUzs(c.costUsd, usdRate)),
  }));
  const ordersChart = (summary?.chart ?? []).map((c) => ({ name: c.name, value: c.orders ?? 0 }));
  const hasOrdersTrend = ordersChart.some((c) => c.value > 0);

  const categories = summary?.categories ?? [];
  const donutData = categories.map((c, i) => ({
    name: c.name,
    value: Math.round(c.percentage),
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  const topProducts = summary?.topProducts ?? [];

  // ── Sana tanlash ─────────────────────────────────────────────────────
  const todayInput = toInputDate(Date.now());
  const selectPreset = (id: string) => { setCustom(null); setPickerOpen(false); setTimeRange(id); };
  const openPicker = () => {
    const now = Date.now();
    setDraftFrom(toInputDate(custom?.dateFrom ?? now));
    setDraftTo(toInputDate(custom?.dateTo ?? now));
    setPickerOpen((o) => !o);
  };
  const onChangeFrom = (v: string) => { setDraftFrom(v); if (!draftTo || draftTo < v) setDraftTo(v); };
  const onChangeTo = (v: string) => { setDraftTo(v); if (draftFrom && v < draftFrom) setDraftFrom(v); };
  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const a = dayStartMs(draftFrom); const b = dayEndMs(draftTo);
    setCustom({ dateFrom: Math.min(a, b), dateTo: Math.max(a, b) });
    setPickerOpen(false);
  };

  const rangeLabel: Record<string, string> = {
    today: "bugun", week: "oxirgi 7 kun", month: "oxirgi 30 kun", quarter: "oxirgi 3 oy", year: "oxirgi 1 yil",
  };
  const periodHint = custom ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}` : (rangeLabel[timeRange] || "tanlangan davr");

  const statCards = [
    { label: "Jami daromad", value: fmtMoney(revenue), sub: periodHint, icon: DollarSign, color: "#8b5cf6" },
    { label: "Sof foyda", value: fmtMoney(netProfit), sub: costIncomplete ? "marja taxminiy" : `marja ${margin.toFixed(1)}%`, icon: TrendingUp, color: "#10b981", trend: margin },
    { label: "Buyurtmalar", value: fmtNum(orders), sub: `${fmtNum(unitsSold)} dona sotilgan`, icon: ShoppingCart, color: "#3b82f6" },
    { label: "O'rtacha buyurtma", value: fmtMoney(aov), sub: "daromad / buyurtma", icon: BarChart3, color: "#f59e0b" },
  ];

  const miniStats = [
    { label: "Marja", value: `${margin.toFixed(1)}%`, icon: Activity, color: margin >= 0 ? "#10b981" : "#ef4444" },
    { label: "Sotilgan birlik", value: `${fmtNum(unitsSold)} dona`, icon: Boxes, color: "#06b6d4" },
    { label: "Birlik daromadi", value: fmtMoney(perUnit), icon: Layers, color: "#8b5cf6" },
    { label: "Faol mahsulot", value: `${fmtNum(activeProducts)} ta`, icon: Package, color: "#ec4899" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analitika"
        subtitle="Savdo va daromad chuqur tahlili"
        action={
          <button
            onClick={refreshAll}
            disabled={isFetching || pa.isFetching || !isConnected}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#71717a] hover:text-white transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isFetching || pa.isFetching) && "animate-spin")} />
            Yangilash
          </button>
        }
      />

      {/* Time range + custom date */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f0f16] border border-[#1c1c24]">
          {timeRanges.map((r) => (
            <button
              key={r.id}
              onClick={() => selectPreset(r.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                !custom && timeRange === r.id ? "bg-[#8b5cf6] text-white shadow-sm" : "text-[#71717a] hover:text-white",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={openPicker}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
              custom ? "bg-[#8b5cf6] text-white border-[#8b5cf6]" : "bg-[#0f0f16] border-[#1c1c24] text-[#71717a] hover:text-white hover:border-[#27272a]",
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            {custom ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}` : "Sana tanlash"}
            {custom && (
              <X className="w-3.5 h-3.5 ml-0.5 opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setCustom(null); setPickerOpen(false); }} />
            )}
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 top-full mt-2 z-20 w-72 p-4 rounded-xl bg-[#0f0f16] border border-[#27272a] shadow-xl">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[#71717a] mb-1">Boshlanish sanasi</label>
                    <input type="date" value={draftFrom} max={todayInput} onChange={(e) => onChangeFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#71717a] mb-1">Tugash sanasi</label>
                    <input type="date" value={draftTo} max={todayInput} onChange={(e) => onChangeTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={applyCustom} disabled={!draftFrom || !draftTo}
                      className="flex-1 px-3 py-2 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] transition-all disabled:opacity-40">Qo'llash</button>
                    <button onClick={() => setPickerOpen(false)}
                      className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-[#71717a] hover:text-white transition-all">Bekor</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] animate-pulse" />)}
        </div>
      ) : !isConnected ? (
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24]"><NotConnectedState /></div>
      ) : (
        <>
          {/* Tan narx ogohlantirishi */}
          {costIncomplete && (
            <div className="rounded-xl bg-[#f59e0b]/8 border border-[#f59e0b]/20 px-4 py-2.5 flex items-center gap-2 text-[11px] text-[#f59e0b]">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Sof foyda taxminiy — {fmtNum(coverage!.totalSoldQty - coverage!.costedQty)} ta sotilgan birlik uchun tan narx kiritilmagan.
            </div>
          )}

          {/* Asosiy KPI kartalari */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${s.color}18` }}>
                  <s.icon className="w-4.5 h-4.5" style={{ color: s.color }} />
                </div>
                <p className="text-xs text-[#52525b] mb-1">{s.label}</p>
                <p className="text-lg font-bold text-white truncate" title={s.value}>{s.value}</p>
                <div className="flex items-center gap-1 mt-1 text-[11px]">
                  {typeof s.trend === "number" && (
                    <span className={cn("flex items-center gap-0.5 font-semibold", s.trend >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
                      {s.trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    </span>
                  )}
                  <span className="text-[#52525b]">{s.sub}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Ikkilamchi ko'rsatkichlar */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {miniStats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}
                className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}18` }}>
                  <s.icon className="w-4.5 h-4.5" style={{ color: s.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#52525b]">{s.label}</p>
                  <p className="text-sm font-bold text-white truncate" title={s.value}>{s.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Daromad trendi */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Daromad va sof foyda trendi</h2>
                <p className="text-xs text-[#52525b] mt-0.5">{periodHint} bo'yicha dinamika</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{fmtMoney(revenue)}</p>
                <p className="text-xs text-[#10b981]">sof foyda {fmtMoney(netProfit)}</p>
              </div>
            </div>
            {isFetching && !summary ? (
              <div className="h-[280px] flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
            ) : revChart.length ? (
              <RevenueAreaChart
                data={revChart}
                primaryKey="revenue"
                secondaryKey="profit"
                primaryLabel="Daromad"
                secondaryLabel="Sof foyda"
                formatter={(v) => fmtMoney(v)}
                height={280}
              />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-xs text-[#52525b]">Bu davrda ma'lumot yo'q</div>
            )}
          </motion.div>

          {/* Buyurtmalar + Kategoriyalar */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="xl:col-span-2 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
            >
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-white">Buyurtmalar dinamikasi</h2>
                <p className="text-xs text-[#52525b] mt-0.5">{periodHint} — jami {fmtNum(orders)} buyurtma</p>
              </div>
              {hasOrdersTrend ? (
                <SalesBarChart data={ordersChart} label="Buyurtmalar" color="#3b82f6" height={240} highlightLast />
              ) : (
                <div className="h-[240px] flex items-center justify-center text-xs text-[#52525b]">Bu davrda buyurtma yo'q</div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5"
            >
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">Kategoriyalar</h2>
                <p className="text-xs text-[#52525b] mt-0.5">Daromad bo'yicha taqsimot</p>
              </div>
              {donutData.length ? (
                <>
                  <DonutChart data={donutData} innerLabel="Kategoriya" innerValue={String(donutData.length)} height={180} />
                  <div className="mt-4"><DonutLegend data={donutData} /></div>
                </>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-xs text-[#52525b]">Ma'lumot yo'q</div>
              )}
            </motion.div>
          </div>

          {/* Top mahsulotlar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#18181b]">
              <div>
                <h2 className="text-sm font-semibold text-white">Top mahsulotlar</h2>
                <p className="text-xs text-[#52525b] mt-0.5">Daromad bo'yicha eng yaxshi {topProducts.length} ta</p>
              </div>
              <Link href="/products" className="text-xs text-[#8b5cf6] hover:text-[#a78bfa]">Barchasi</Link>
            </div>
            <div className="divide-y divide-[#18181b]">
              {topProducts.map((p, i) => {
                const max = Number(topProducts[0]?.revenue) || 1;
                const pct = Math.round((Number(p.revenue) / max) * 100);
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#18181b]/40 transition-colors">
                    <span className="text-xs font-bold text-[#3f3f46] w-5 flex-shrink-0">#{i + 1}</span>
                    <div className="w-10 h-10 rounded-lg bg-[#18181b] overflow-hidden flex items-center justify-center ring-1 ring-[#27272a] flex-shrink-0">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Package className="w-4 h-4 text-[#3f3f46]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate" title={p.name}>{p.name}</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#18181b] overflow-hidden">
                        <motion.div className="h-full rounded-full bg-[#8b5cf6]" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.4 + i * 0.05 }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 w-32">
                      <p className="text-sm font-semibold text-white tabular-nums">{fmtMoney(Number(p.revenue))}</p>
                      <p className="text-[11px] text-[#52525b]">{fmtNum(p.soldCount)} ta sotilgan</p>
                    </div>
                  </div>
                );
              })}
              {!topProducts.length && (
                <div className="py-12 text-center text-xs text-[#52525b]">Bu davrda sotuv bo'lmagan</div>
              )}
            </div>
          </motion.div>

          {/* ── Mahsulotlar analitikasi (umumiy) ── */}
          <ProductAnalyticsSection pa={pa} fmtMoney={fmtMoney} />
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Mahsulotlar bo'yicha to'liq analitika (umumiy ko'rsatkichlar, davrdan mustaqil)
// ════════════════════════════════════════════════════════════════════════════

type ProdSort = "turnover" | "sold" | "viewers" | "rating" | "returns" | "stock" | "conversion";

const RANK_COLORS: Record<string, string> = {
  A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#ef4444", N: "#71717a",
};

function ProductAnalyticsSection({
  pa,
  fmtMoney,
}: {
  pa: ReturnType<typeof useProductAnalytics>;
  fmtMoney: (n: number) => string;
}) {
  const { data, isLoading, isError } = pa;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProdSort>("turnover");

  const rows = useMemo(() => {
    const list = (data?.products ?? []).filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || String(p.productId).includes(q);
    });
    const key = (p: ProductAnalyticsRow) => {
      switch (sort) {
        case "sold": return p.sold;
        case "viewers": return p.viewers;
        case "rating": return p.rating;
        case "returns": return p.returnedPct;
        case "stock": return p.stock;
        case "conversion": return p.viewToSale;
        default: return p.turnover;
      }
    };
    return [...list].sort((a, b) => key(b) - key(a));
  }, [data, search, sort]);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-2xl bg-[#ef4444]/8 border border-[#ef4444]/20 p-6 text-center">
        <AlertCircle className="w-7 h-7 text-[#ef4444] mx-auto mb-2" />
        <p className="text-sm text-white font-semibold">Mahsulotlar analitikasini yuklab bo'lmadi</p>
        <button onClick={() => pa.refresh()} className="mt-3 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium">Qayta urinish</button>
      </div>
    );
  }

  const t = data.totals;
  const fmtNum2 = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

  const kpis = [
    { label: "Jami mahsulot", value: `${fmtNum2(t.products)} ta`, sub: `${fmtNum2(t.inStock)} sotuvda`, icon: Package, color: "#8b5cf6" },
    { label: "Jami ko'rishlar", value: fmtNum2(t.totalViewers), sub: "barcha mahsulot", icon: Eye, color: "#3b82f6" },
    { label: "Jami sotilgan", value: `${fmtNum2(t.totalSold)} dona`, sub: `${fmtNum2(t.totalFeedback)} izoh`, icon: ShoppingCart, color: "#10b981" },
    { label: "Ko'rishdan sotuvga", value: `${t.avgViewToSale.toFixed(1)}%`, sub: "o'rtacha konversiya", icon: Activity, color: "#06b6d4" },
    { label: "O'rtacha reyting", value: t.avgRating.toFixed(2), sub: "baholangan mahsulotlar", icon: Star, color: "#f59e0b" },
    { label: "Qaytish darajasi", value: `${t.returnRate.toFixed(1)}%`, sub: `${fmtNum2(t.totalReturned)} ta qaytgan`, icon: Undo2, color: "#ef4444" },
    { label: "Ombor qiymati", value: fmtMoney(t.inventoryValue), sub: `${fmtNum2(t.inventoryUnits)} dona qoldiq`, icon: Warehouse, color: "#ec4899" },
    { label: "Umumiy savdo hajmi", value: fmtMoney(t.turnover), sub: "narx × sotilgan", icon: DollarSign, color: "#8b5cf6" },
  ];

  // Funnel: ko'rishlar → sotilgan → qaytarilgan
  const funnelSteps = [
    { name: "Ko'rishlar", value: data.funnel.viewers, color: "#3b82f6" },
    { name: "Sotilgan", value: data.funnel.sold, color: "#10b981" },
    { name: "Qaytarilgan", value: data.funnel.returned, color: "#ef4444" },
  ];
  const funnelMax = funnelSteps[0].value || 1;

  const ranks = ["A", "B", "C", "D", "N"].filter((r) => (data.rankDist[r] || 0) > 0);
  const rankTotal = Object.values(data.rankDist).reduce((s, v) => s + v, 0) || 1;

  const sortOptions: { id: ProdSort; label: string }[] = [
    { id: "turnover", label: "Savdo hajmi" },
    { id: "sold", label: "Eng ko'p sotilgan" },
    { id: "viewers", label: "Eng ko'p ko'rilgan" },
    { id: "conversion", label: "Konversiya" },
    { id: "rating", label: "Reyting" },
    { id: "returns", label: "Qaytish %" },
    { id: "stock", label: "Qoldiq" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-[#1c1c24]" />
        <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5" /> Mahsulotlar analitikasi
        </span>
        <div className="h-px flex-1 bg-[#1c1c24]" />
      </div>
      <p className="text-[11px] text-[#52525b] text-center -mt-2">Umumiy ko'rsatkichlar (butun faoliyat davri bo'yicha)</p>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
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

      {/* Funnel + Rank distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Ko'rishdan sotuvga (funnel)</h3>
          <p className="text-xs text-[#52525b] mb-4">Mahsulot ko'rishlari, sotuvlari va qaytarishlari</p>
          <div className="space-y-3">
            {funnelSteps.map((step, i) => {
              const pct = (step.value / funnelMax) * 100;
              const rel = i > 0 && funnelSteps[i - 1].value > 0 ? ((step.value / funnelSteps[i - 1].value) * 100).toFixed(1) : null;
              return (
                <div key={step.name} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-[#71717a] text-right flex-shrink-0">{step.name}</div>
                  <div className="flex-1 h-8 bg-[#18181b] rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${Math.max(pct, 3)}%` }} transition={{ delay: i * 0.1, duration: 0.6 }}
                      className="h-full rounded-lg flex items-center justify-end pr-2.5"
                      style={{ background: step.color }}
                    >
                      <span className="text-xs font-semibold text-white/90">{fmtNum2(step.value)}</span>
                    </motion.div>
                  </div>
                  <div className="w-12 text-xs text-[#52525b] text-right flex-shrink-0">{rel ? `${rel}%` : "100%"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5">
          <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-1.5"><Award className="w-4 h-4 text-[#f59e0b]" /> Reyting (rank) taqsimoti</h3>
          <p className="text-xs text-[#52525b] mb-4">Uzum mahsulot reytingi bo'yicha</p>
          <div className="space-y-2.5">
            {ranks.map((r) => {
              const cnt = data.rankDist[r] || 0;
              const pct = (cnt / rankTotal) * 100;
              return (
                <div key={r} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: `${RANK_COLORS[r]}1f`, color: RANK_COLORS[r] }}>{r}</span>
                  <div className="flex-1 h-2 bg-[#18181b] rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }} style={{ background: RANK_COLORS[r] }} />
                  </div>
                  <span className="text-xs font-semibold text-white w-10 text-right flex-shrink-0">{cnt} ta</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Product table */}
      <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-[#18181b]">
          <div>
            <h3 className="text-sm font-semibold text-white">Mahsulotlar bo'yicha ko'rsatkichlar</h3>
            <p className="text-xs text-[#52525b] mt-0.5">{fmtNum2(rows.length)} ta mahsulot</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mahsulot qidirish..."
                className="h-9 w-44 pl-8 pr-3 rounded-xl bg-[#18181b] border border-[#27272a] text-xs text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <div className="relative">
              <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b] pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ProdSort)}
                className="h-9 pl-8 pr-7 rounded-xl bg-[#18181b] border border-[#27272a] text-xs text-white focus:outline-none focus:border-[#8b5cf6] appearance-none cursor-pointer"
              >
                {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-[#52525b] uppercase tracking-wider border-b border-[#18181b]">
                <th className="text-left px-5 py-2.5 font-semibold">Mahsulot</th>
                <th className="text-right px-3 py-2.5 font-semibold">Ko'rish</th>
                <th className="text-right px-3 py-2.5 font-semibold">Sotilgan</th>
                <th className="text-right px-3 py-2.5 font-semibold">Konv.</th>
                <th className="text-right px-3 py-2.5 font-semibold">Reyting</th>
                <th className="text-right px-3 py-2.5 font-semibold">Qaytish</th>
                <th className="text-right px-3 py-2.5 font-semibold">Qoldiq</th>
                <th className="text-right px-5 py-2.5 font-semibold">Savdo hajmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18181b]">
              {rows.slice(0, 100).map((p) => (
                <tr key={p.productId} className="hover:bg-[#18181b]/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#18181b] overflow-hidden flex items-center justify-center ring-1 ring-[#27272a] flex-shrink-0">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : <Package className="w-4 h-4 text-[#3f3f46]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate max-w-[260px]" title={p.title}>{p.title || "Nomsiz"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${RANK_COLORS[p.rank] || "#71717a"}1f`, color: RANK_COLORS[p.rank] || "#71717a" }}>{p.rank}</span>
                          <span className="text-[10px] text-[#52525b] truncate max-w-[140px]">{p.category}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[#a1a1aa]">{fmtNum2(p.viewers)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-white">{fmtNum2(p.sold)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[#a1a1aa]">{p.viewToSale.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.rating > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[#f59e0b]"><Star className="w-3 h-3 fill-current" />{p.rating.toFixed(1)}</span>
                    ) : <span className="text-[#3f3f46]">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={cn(p.returnedPct > 10 ? "text-[#ef4444]" : "text-[#a1a1aa]")}>{p.returnedPct.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={cn(p.stock === 0 ? "text-[#ef4444]" : "text-white")}>{fmtNum2(p.stock)}</span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-white">{fmtMoney(p.turnover)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-12 text-center text-xs text-[#52525b]">Mahsulot topilmadi</div>}
        {rows.length > 100 && (
          <div className="px-5 py-3 border-t border-[#18181b] text-[11px] text-[#52525b] text-center">Eng yuqori 100 ta ko'rsatilmoqda · qidiruvdan foydalaning</div>
        )}
      </div>
    </div>
  );
}
