"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, ShoppingCart, Package, TrendingUp, Calendar, X,
  Loader2, RefreshCw, Plus, Trash2, Activity, Truck, Fuel, Box, Wallet, Home, MoreHorizontal,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { RevenueAreaChart } from "@/components/charts/area-chart";
import { DonutChart, DonutLegend } from "@/components/charts/donut-chart";
import { cn } from "@/lib/utils";
import { useDashboardSummary } from "@/hooks/use-finance";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useAuthStore } from "@/stores/auth-store";
import { formatMoney, usdToUzs } from "@/lib/currency";
import { toast } from "sonner";

// ─── Sana yordamchilari ─────────────────────────────────────────────────
const DAY = 86_400_000;
function dayStartMs(s: string) { return new Date(`${s}T00:00:00`).getTime(); }
function dayEndMs(s: string) { return new Date(`${s}T23:59:59.999`).getTime(); }
function toInputDate(ms: number) {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDate(ms: number) {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const timeRanges = [
  { id: "today", label: "Bugun" },
  { id: "week", label: "Hafta" },
  { id: "month", label: "Oy" },
  { id: "quarter", label: "3 oy" },
  { id: "year", label: "Yil" },
];

/** Preset davr → [from, to] ms (backend resolveRange bilan bir xil). */
function presetRange(id: string): { from: number; to: number } {
  const to = Date.now();
  const startToday = dayStartMs(toInputDate(to));
  switch (id) {
    case "week": return { from: to - 7 * DAY, to };
    case "month": return { from: to - 30 * DAY, to };
    case "quarter": return { from: to - 90 * DAY, to };
    case "year": return { from: to - 365 * DAY, to };
    case "today":
    default: return { from: startToday, to };
  }
}

// ─── Harakatlar (qo'lda operatsion xarajatlar) ───────────────────────────
interface Harakat {
  id: string;
  category: string;   // kalit (transport/fuel/...)
  note?: string;
  amount: number;     // so'm
  date: string;       // yyyy-mm-dd
  addedAt: number;
}

const HARAKAT_CATS: { key: string; label: string; icon: any; color: string }[] = [
  { key: "transport", label: "Yo'lkira", icon: Truck, color: "#3b82f6" },
  { key: "fuel", label: "Benzin", icon: Fuel, color: "#f59e0b" },
  { key: "packaging", label: "Strech / qadoq", icon: Box, color: "#8b5cf6" },
  { key: "salary", label: "Ish haqi", icon: Wallet, color: "#10b981" },
  { key: "rent", label: "Ijara", icon: Home, color: "#ec4899" },
  { key: "other", label: "Boshqa", icon: MoreHorizontal, color: "#71717a" },
];
const catMeta = (k: string) => HARAKAT_CATS.find((c) => c.key === k) || HARAKAT_CATS[HARAKAT_CATS.length - 1];

export function FinanceOverview() {
  const storeId = useAuthStore((s) => s.activeStoreId);
  const { usdRate, displayCurrency } = useDashboardStore();
  const fmtMoney = (n: number) => formatMoney(n, displayCurrency, usdRate);

  // ── Davr filtri ──
  const [timeRange, setTimeRange] = useState("month");
  const [custom, setCustom] = useState<{ dateFrom: number; dateTo: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const todayInput = toInputDate(Date.now());

  const { data: summary, isFetching, refresh } = useDashboardSummary(timeRange, custom);

  // Tanlangan davr [from,to] — harakatlarni filtrlash uchun
  const period = custom ? { from: custom.dateFrom, to: custom.dateTo } : presetRange(timeRange);

  // ── Harakatlar (localStorage, do'kon bo'yicha) ──
  const storageKey = `uzum_manual_expenses_${storeId || "default"}`;
  const [harakatlar, setHarakatlar] = useState<Harakat[]>([]);
  const [hAmount, setHAmount] = useState("");
  const [hCat, setHCat] = useState("transport");
  const [hNote, setHNote] = useState("");
  const [hDate, setHDate] = useState(todayInput);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setHarakatlar(raw ? JSON.parse(raw) : []);
    } catch { setHarakatlar([]); }
  }, [storageKey]);

  const persist = (list: Harakat[]) => {
    setHarakatlar(list);
    try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const addHarakat = () => {
    const digits = hAmount.replace(/\D/g, "");
    const amount = Number(digits);
    if (!amount) { toast.error("Summani kiriting"); return; }
    const entry: Harakat = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      category: hCat, note: hNote.trim() || undefined, amount, date: hDate || todayInput, addedAt: Date.now(),
    };
    persist([entry, ...harakatlar]);
    setHAmount(""); setHNote("");
    toast.success("Harakat qo'shildi");
  };
  const delHarakat = (id: string) => persist(harakatlar.filter((h) => h.id !== id));

  // Davrga tushadigan harakatlar
  const periodHarakatlar = useMemo(
    () => harakatlar.filter((h) => { const t = dayStartMs(h.date); return t >= period.from && t <= period.to; })
      .sort((a, b) => dayStartMs(b.date) - dayStartMs(a.date) || b.addedAt - a.addedAt),
    [harakatlar, period.from, period.to],
  );
  const harakatlarTotal = periodHarakatlar.reduce((s, h) => s + h.amount, 0);
  // Davrning kategoriya bo'yicha jami
  const harakatByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of periodHarakatlar) m.set(h.category, (m.get(h.category) || 0) + h.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodHarakatlar]);

  // ── KPI hisoblari ──
  const revenue = summary?.revenue ?? 0;
  const costUzs = usdToUzs(summary?.costUsd ?? 0, usdRate);
  const netProfit = revenue - costUzs - harakatlarTotal; // Sof foyda — harakatlarni ham ayiramiz
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const rangeLabel: Record<string, string> = {
    today: "bugun", week: "oxirgi 7 kun", month: "oxirgi 30 kun", quarter: "oxirgi 3 oy", year: "oxirgi 1 yil",
  };
  const periodHint = custom ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}` : rangeLabel[timeRange];

  const chartData = (summary?.chart ?? []).map((c) => ({
    name: c.name, value: c.revenue, revenue: c.revenue,
    profit: Math.round(c.revenue - usdToUzs(c.costUsd, usdRate)),
  }));
  const donutData = (summary?.categories ?? []).map((c, i) => ({
    name: c.name, value: Math.round(c.percentage),
    color: ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#71717a"][i % 6],
  }));

  const metricCards = [
    { title: "Jami daromad", value: fmtMoney(revenue), change: 0, changeLabel: "FBS sotuvlardan", icon: DollarSign, color: "#8b5cf6", sparkline: [] as number[] },
    { title: "Buyurtmalar", value: summary?.orders ?? 0, change: 0, changeLabel: periodHint, icon: ShoppingCart, color: "#3b82f6", sparkline: [] },
    { title: "Mahsulotlar", value: summary?.activeProducts ?? 0, change: 0, changeLabel: "faol mahsulotlar", icon: Package, color: "#10b981", sparkline: [] },
    { title: "Sof foyda", value: fmtMoney(netProfit), change: margin, changeLabel: harakatlarTotal > 0 ? "daromad − tan narx − harakat" : "marja · daromad − tan narx", icon: TrendingUp, color: "#f59e0b", sparkline: [] },
  ];

  // ── Sana picker amallari ──
  const selectPreset = (id: string) => { setCustom(null); setPickerOpen(false); setTimeRange(id); };
  const openPicker = () => {
    const now = Date.now();
    setDraftFrom(toInputDate(custom?.dateFrom ?? now));
    setDraftTo(toInputDate(custom?.dateTo ?? now));
    setPickerOpen((o) => !o);
  };
  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const a = dayStartMs(draftFrom), b = dayEndMs(draftTo);
    setCustom({ dateFrom: Math.min(a, b), dateTo: Math.max(a, b) });
    setPickerOpen(false);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Davr filtri ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f0f16] border border-[#1c1c24] overflow-x-auto scrollbar-none">
            {timeRanges.map((r) => (
              <button
                key={r.id}
                onClick={() => selectPreset(r.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0",
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
                custom ? "bg-[#8b5cf6] text-white border-[#8b5cf6]" : "bg-[#0f0f16] border-[#1c1c24] text-[#71717a] hover:text-white",
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{custom ? `${fmtDate(custom.dateFrom)} – ${fmtDate(custom.dateTo)}` : "Sana"}</span>
              {custom && <X className="w-3.5 h-3.5 ml-0.5" onClick={(e) => { e.stopPropagation(); setCustom(null); setPickerOpen(false); }} />}
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-20 w-72 p-4 rounded-xl bg-[#0f0f16] border border-[#27272a] shadow-xl space-y-3">
                  <div>
                    <label className="block text-[11px] text-[#71717a] mb-1">Boshlanish sanasi</label>
                    <input type="date" value={draftFrom} max={todayInput} onChange={(e) => { setDraftFrom(e.target.value); if (!draftTo || draftTo < e.target.value) setDraftTo(e.target.value); }}
                      className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#71717a] mb-1">Tugash sanasi</label>
                    <input type="date" value={draftTo} max={todayInput} onChange={(e) => setDraftTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-white focus:border-[#8b5cf6] outline-none [color-scheme:dark]" />
                  </div>
                  <button onClick={applyCustom} className="w-full py-2 rounded-lg gradient-primary text-white text-xs font-medium">Qo'llash</button>
                </div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => refresh()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f0f16] border border-[#1c1c24] text-xs text-[#71717a] hover:text-white transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          <span className="hidden sm:inline">Yangilash</span>
        </button>
      </div>

      {/* ── KPI kartalar ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {metricCards.map((card, i) => (
          <MetricCard key={card.title} data={card as any} index={i} />
        ))}
      </div>

      {/* ── Grafik + kategoriyalar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Daromad dinamikasi</h2>
            <p className="text-xs text-[#52525b] mt-0.5">Daromad va sof foyda</p>
          </div>
          {isFetching && !summary ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
          ) : chartData.length ? (
            <RevenueAreaChart data={chartData} primaryKey="revenue" secondaryKey="profit" primaryLabel="Daromad" secondaryLabel="Sof foyda" formatter={(v) => fmtMoney(v)} />
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-[#52525b]">Bu davrda ma'lumot yo'q</div>
          )}
        </div>
        <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Kategoriyalar</h2>
            <p className="text-xs text-[#52525b] mt-0.5">Daromad bo'yicha</p>
          </div>
          {donutData.length ? (
            <>
              <DonutChart data={donutData} innerLabel="Jami" innerValue="100%" />
              <DonutLegend data={donutData} />
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-[#52525b]">Ma'lumot yo'q</div>
          )}
        </div>
      </div>

      {/* ── Harakatlar (qo'lda xarajatlar) ── */}
      <HarakatlarPanel
        cats={HARAKAT_CATS}
        periodHint={periodHint}
        total={harakatlarTotal}
        byCat={harakatByCat}
        entries={periodHarakatlar}
        fmtMoney={fmtMoney}
        // form
        hAmount={hAmount} setHAmount={setHAmount}
        hCat={hCat} setHCat={setHCat}
        hNote={hNote} setHNote={setHNote}
        hDate={hDate} setHDate={setHDate}
        todayInput={todayInput}
        onAdd={addHarakat} onDelete={delHarakat}
      />
    </div>
  );
}

// ─── Harakatlar paneli ───────────────────────────────────────────────────
function HarakatlarPanel(props: {
  cats: typeof HARAKAT_CATS;
  periodHint: string;
  total: number;
  byCat: [string, number][];
  entries: Harakat[];
  fmtMoney: (n: number) => string;
  hAmount: string; setHAmount: (v: string) => void;
  hCat: string; setHCat: (v: string) => void;
  hNote: string; setHNote: (v: string) => void;
  hDate: string; setHDate: (v: string) => void;
  todayInput: string;
  onAdd: () => void; onDelete: (id: string) => void;
}) {
  const { cats, periodHint, total, byCat, entries, fmtMoney } = props;
  const fmtAmt = (v: string) => v.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-[#1c1c24] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#06b6d4]/15 border border-[#06b6d4]/25 flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-[#06b6d4]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Harakatlar</h3>
            <p className="text-[11px] text-[#71717a]">
              {periodHint} · {entries.length} ta · Jami: <span className="text-[#06b6d4] font-semibold">{fmtMoney(total)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Qo'shish formasi */}
      <div className="p-4 sm:p-5 border-b border-[#1c1c24] space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => {
            const active = props.hCat === c.key;
            return (
              <button key={c.key} onClick={() => props.setHCat(c.key)}
                className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                  active ? "text-white" : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#3f3f46]")}
                style={active ? { background: `${c.color}22`, borderColor: `${c.color}66`, color: c.color } : undefined}>
                <c.icon className="w-3.5 h-3.5" /> {c.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input inputMode="numeric" value={fmtAmt(props.hAmount)} onChange={(e) => props.setHAmount(e.target.value)}
              placeholder="Summa (so'm)" onKeyDown={(e) => { if (e.key === "Enter") props.onAdd(); }}
              className="w-full h-10 px-3 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white tabular-nums focus:outline-none focus:border-[#06b6d4] placeholder:text-[#52525b]" />
          </div>
          <input type="date" value={props.hDate} max={props.todayInput} onChange={(e) => props.setHDate(e.target.value)}
            className="h-10 px-3 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white focus:outline-none focus:border-[#06b6d4] [color-scheme:dark]" />
          <input value={props.hNote} onChange={(e) => props.setHNote(e.target.value)} placeholder="Izoh (ixtiyoriy)"
            onKeyDown={(e) => { if (e.key === "Enter") props.onAdd(); }}
            className="flex-1 h-10 px-3 rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white focus:outline-none focus:border-[#06b6d4] placeholder:text-[#52525b]" />
          <button onClick={props.onAdd}
            className="h-10 px-4 rounded-lg bg-gradient-to-br from-[#06b6d4] to-[#0891b2] hover:from-[#0ec8e3] hover:to-[#0aa3c4] text-white text-sm font-semibold flex items-center justify-center gap-1.5">
            <Plus className="w-4 h-4" /> Qo'shish
          </button>
        </div>
      </div>

      {/* Kategoriya bo'yicha jami */}
      {byCat.length > 0 && (
        <div className="px-4 sm:px-5 py-3 border-b border-[#1c1c24] flex flex-wrap gap-2">
          {byCat.map(([k, v]) => {
            const m = catMeta(k);
            return (
              <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px]" style={{ color: m.color }}>
                <m.icon className="w-3 h-3" /> {m.label}: <span className="font-semibold tabular-nums">{fmtMoney(v)}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Ro'yxat */}
      {entries.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#52525b]">Bu davrda harakat yo'q. Yuqoridan qo'shing (yo'lkira, benzin, strech…).</div>
      ) : (
        <div className="divide-y divide-[#18181b] max-h-[360px] overflow-y-auto scrollbar-thin">
          {entries.map((h) => {
            const m = catMeta(h.category);
            return (
              <div key={h.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 group hover:bg-[#13131a] transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${m.color}18`, border: `1px solid ${m.color}33` }}>
                  <m.icon className="w-4 h-4" style={{ color: m.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{m.label}{h.note ? <span className="text-[#71717a] font-normal"> · {h.note}</span> : ""}</p>
                  <p className="text-[11px] text-[#52525b]">{fmtDate(dayStartMs(h.date))}</p>
                </div>
                <p className="text-sm font-bold text-[#ef4444] tabular-nums whitespace-nowrap">− {fmtMoney(h.amount)}</p>
                <button onClick={() => props.onDelete(h.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717a] hover:text-[#ef4444] p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
