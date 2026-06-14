"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Search, Loader2, Square, Download, Copy, Check, ExternalLink,
  AlertTriangle, Zap, ShieldAlert, Settings2, Package, TrendingUp, Star,
  Target, Gauge, ShieldX, Wifi, WifiOff, ArrowUpDown, RefreshCw, Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

// Global analiz xizmati (alohida Python jarayoni) — dashboard backendiga tegmaydi.
const DEFAULT_ANALYZER = process.env.NEXT_PUBLIC_ANALYZER_URL || "http://127.0.0.1:8000";

interface FoundProduct {
  id: number | string;
  rank: number;
  weekly: number;
  title: string;
  image: string;
  price: number | null;
  rating: number | null;
  url: string;
}
interface LogEntry { n: number; title: string; weekly: number | null; state: "hit" | "miss" | "nowk" | "blocked"; }
interface Progress { found: number; checked: number; collected: number; blocked: number; rate?: number; cooling?: boolean; }
type SortKey = "rank" | "weekly" | "priceAsc" | "priceDesc";

function fmtNum(n?: number | null) { return new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0)); }
function fmtSom(n?: number | null) { return n ? `${fmtNum(n)} so'm` : "—"; }

/* ── Animatsiyali son (KPI kartalar uchun) ───────────────────────────────── */
function useAnimatedNumber(value: number, duration = 450) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}
function AnimatedNumber({ value }: { value: number }) {
  return <>{fmtNum(useAnimatedNumber(value))}</>;
}

/* ── Reyting yulduzchalari ────────────────────────────────────────────────── */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      <Star className="w-3 h-3 fill-[#fbbf24] text-[#fbbf24]" />
      <span className="text-[11px] font-semibold text-[#d4d4d8]">{rating.toFixed(1)}</span>
    </span>
  );
}

const MEDAL: Record<number, { bg: string; text: string }> = {
  1: { bg: "bg-gradient-to-br from-[#fbbf24] to-[#d97706]", text: "text-[#1c1300]" },
  2: { bg: "bg-gradient-to-br from-[#e5e7eb] to-[#9ca3af]", text: "text-[#1c1300]" },
  3: { bg: "bg-gradient-to-br from-[#f59e0b] to-[#b45309]", text: "text-white" },
};

export default function GlobalAnalysisPage() {
  const [url, setUrl] = useState("https://uzum.uz/uz/category/uy-rozgor-buyumlari-10018");
  const [min, setMin] = useState("70");
  const [max, setMax] = useState("80");
  const [count, setCount] = useState("30");
  const [analyzerUrl, setAnalyzerUrl] = useState(DEFAULT_ANALYZER);
  const [showSettings, setShowSettings] = useState(false);
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null);

  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [products, setProducts] = useState<FoundProduct[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [doneBanner, setDoneBanner] = useState("");
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  const esRef = useRef<EventSource | null>(null);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const gotAnyRef = useRef(false);

  const targetNum = Math.max(1, Number(count) || 30);

  /* Xizmat holatini tekshirish (/health) */
  const checkHealth = useCallback(async (rawBase: string) => {
    const base = rawBase.replace(/\/$/, "");
    setServiceOnline(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`${base}/health`, { signal: ctrl.signal, cache: "no-store" });
      setServiceOnline(r.ok);
    } catch {
      setServiceOnline(false);
    } finally {
      clearTimeout(timer);
    }
  }, []);

  /* Saqlangan analyzer URL'ini o'qish */
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("analyzer-url") : null;
    if (saved) setAnalyzerUrl(saved);
  }, []);

  /* URL o'zgarsa — holatni qayta tekshiramiz */
  useEffect(() => { checkHealth(analyzerUrl); }, [analyzerUrl, checkHealth]);

  /* Log panelni avto-pastga surish */
  useEffect(() => {
    const el = logBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const stop = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
  }, []);

  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  const finish = useCallback((d: any) => {
    stop();
    const blockedNote = d.blocked ? ` ${d.blocked} ta sahifa anti-bot tufayli o'qilmadi — biroz kutib qayta urinib ko'ring.` : "";
    if (d.found === 0) {
      setDoneBanner(d.blocked
        ? `Natija yo'q. ${d.blocked} ta sahifa Uzum anti-bot tomonidan bloklandi. 5-10 daqiqa kutib qayta urinib ko'ring.`
        : "Bu oraliqda mahsulot topilmadi.");
    } else {
      setDoneBanner(`${d.found} ta mahsulot topildi (jami ${fmtNum(d.checked)} ta tekshirildi).${blockedNote}`);
    }
  }, [stop]);

  const start = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (!url.trim() || !url.includes("/category/")) {
      setError("Iltimos to'g'ri kategoriya URL kiriting (masalan https://uzum.uz/uz/category/...).");
      return;
    }
    // reset
    setProducts([]); setLogs([]); setError(""); setDoneBanner(""); setProgress(null);
    setStatusMsg("Boshlanyapti…"); setRunning(true);
    gotAnyRef.current = false;

    const base = analyzerUrl.replace(/\/$/, "");
    const q = new URLSearchParams({ url: url.trim(), min: min || "0", max: max || "0", count: count || "30" });
    const es = new EventSource(`${base}/search?${q.toString()}`);
    esRef.current = es;

    es.onmessage = (e) => {
      let d: any;
      try { d = JSON.parse(e.data); } catch { return; }
      gotAnyRef.current = true;
      setServiceOnline(true);
      switch (d.event) {
        case "status": setStatusMsg(d.message); break;
        case "progress": setProgress({ found: d.found, checked: d.checked, collected: d.collected, blocked: d.blocked, rate: d.rate, cooling: d.cooling }); break;
        case "log": setLogs((prev) => { const next = [...prev, { n: d.n, title: d.title, weekly: d.weekly, state: d.state }]; return next.length > 400 ? next.slice(-400) : next; }); break;
        case "product":
          setProducts((prev) => [...prev, { id: d.id, rank: d.rank, weekly: d.weekly, title: d.title, image: d.image, price: d.price, rating: d.rating, url: d.url }]);
          setStatusMsg(`Topilmoqda… (${d.rank} ta)`);
          break;
        case "done": finish(d); break;
        case "error": setError(d.message); stop(); break;
      }
    };
    es.onerror = () => {
      // Xizmat ishlamasa yoki stream uzilsa
      if (!gotAnyRef.current) {
        setServiceOnline(false);
        setError(`Global analiz xizmatiga ulanib bo'lmadi (${base}). Python xizmatini ishga tushiring: "python app.py" (uzumanalyz papkasida).`);
      }
      stop();
    };
  };

  const manualStop = () => {
    const n = products.length;
    stop();
    if (n > 0) setDoneBanner(`To'xtatildi. ${n} ta mahsulot topildi.`);
  };

  const copyLinks = async () => {
    if (!products.length) return;
    const text = displayed.map((p) => p.url).join("\n");
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const exportXlsx = async () => {
    if (!products.length) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Uzum Dashboard";
    const ws = wb.addWorksheet("Global analiz");
    ws.columns = [
      { header: "#", key: "n", width: 6 },
      { header: "Haftalik xaridor", key: "weekly", width: 16 },
      { header: "Nom", key: "title", width: 60 },
      { header: "Narx (so'm)", key: "price", width: 14 },
      { header: "Reyting", key: "rating", width: 9 },
      { header: "Havola", key: "url", width: 60 },
    ];
    ws.getRow(1).font = { bold: true };
    displayed.forEach((p, i) => {
      const row = ws.addRow({ n: i + 1, weekly: p.weekly, title: p.title, price: p.price ?? "", rating: p.rating ?? "", url: p.url });
      const c = row.getCell(6);
      if (p.url) { c.value = { text: p.url, hyperlink: p.url }; c.font = { color: { argb: "FF2563EB" }, underline: true }; }
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = dl; a.download = `global-analiz-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(dl), 5000);
  };

  const saveAnalyzerUrl = () => {
    const v = analyzerUrl.trim() || DEFAULT_ANALYZER;
    setAnalyzerUrl(v);
    localStorage.setItem("analyzer-url", v);
    checkHealth(v);
    setShowSettings(false);
  };

  /* Saralangan ro'yxat */
  const displayed = useMemo(() => {
    const arr = [...products];
    switch (sortKey) {
      case "weekly": arr.sort((a, b) => b.weekly - a.weekly); break;
      case "priceAsc": arr.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)); break;
      case "priceDesc": arr.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)); break;
      default: arr.sort((a, b) => a.rank - b.rank);
    }
    return arr;
  }, [products, sortKey]);

  const showStats = running || !!progress || products.length > 0;
  const foundPct = Math.min(100, Math.round((products.length / targetNum) * 100));

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Global Analiz"
        subtitle="Uzum bozori bo'yicha kategoriya tahlili — haftalik xaridorlar soni filtri"
        action={
          <div className="flex items-center gap-2">
            <ServiceBadge online={serviceOnline} onRefresh={() => checkHealth(analyzerUrl)} />
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all"
            >
              <Settings2 className="w-3.5 h-3.5" /> Sozlama
            </button>
          </div>
        }
      />

      {/* Settings (analyzer URL) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-[11px] text-[#71717a] mb-1.5">Global analiz xizmati manzili (Python)</label>
                <input
                  value={analyzerUrl}
                  onChange={(e) => setAnalyzerUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                  className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white focus:outline-none focus:border-[#8b5cf6]"
                />
              </div>
              <button onClick={() => checkHealth(analyzerUrl)} className="h-10 px-4 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-semibold text-[#a1a1aa] hover:text-white transition-all">Tekshirish</button>
              <button onClick={saveAnalyzerUrl} className="h-10 px-4 rounded-xl bg-[#8b5cf6] text-white text-xs font-semibold hover:bg-[#7c3aed] transition-all">Saqlash</button>
            </div>
            <p className="text-[11px] text-[#52525b] mt-2 px-1">
              Bu bo'lim alohida Python xizmati orqali ishlaydi (dashboard'ning boshqa bo'limlariga ta'sir qilmaydi).
              Ishga tushirish: <span className="font-mono text-[#a1a1aa]">uzumanalyz</span> papkasida <span className="font-mono text-[#a1a1aa]">python app.py</span>.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search form */}
      <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <label className="block text-[11px] text-[#71717a] mb-1.5">Kategoriya havolasi (URL)</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !running && start()}
                placeholder="https://uzum.uz/uz/category/..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30"
              />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-20">
              <label className="block text-[11px] text-[#71717a] mb-1.5">N dan</label>
              <input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white text-center focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            <span className="text-[#52525b] pb-2.5 font-bold">—</span>
            <div className="w-20">
              <label className="block text-[11px] text-[#71717a] mb-1.5">N gacha</label>
              <input type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white text-center focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            <div className="w-20">
              <label className="block text-[11px] text-[#71717a] mb-1.5">Soni</label>
              <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white text-center focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            {!running ? (
              <button onClick={start} className="h-10 px-5 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-[#8b5cf6]/20">
                <Search className="w-4 h-4" /> Qidirish
              </button>
            ) : (
              <button onClick={manualStop} className="h-10 px-5 rounded-xl bg-[#18181b] border border-[#ef4444]/40 text-[#ef4444] text-sm font-semibold flex items-center gap-2 hover:bg-[#ef4444]/10 transition-all">
                <Square className="w-3.5 h-3.5 fill-current" /> To'xtatish
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[#52525b] mt-3">
          Masalan 70–80 = haftalik xaridorlar soni shu oraliqda bo'lgan mahsulotlar. Eng ko'p sotilganlardan boshlab qidiriladi, natijalar jonli chiqadi.
        </p>
      </div>

      {/* Live KPI cards */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <StatCard
              icon={<Target className="w-4 h-4" />} accent="#8b5cf6"
              label="Topildi" value={products.length}
              footer={
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-[#52525b] mb-1">
                    <span>maqsad: {targetNum}</span><span>{foundPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#18181b] overflow-hidden">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa]" animate={{ width: `${foundPct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                  </div>
                </div>
              }
            />
            <StatCard icon={<Gauge className="w-4 h-4" />} accent="#3b82f6" label="Tekshirilgan" value={progress?.checked ?? 0} sub={`yig'ilgan ID: ${fmtNum(progress?.collected ?? 0)}`} />
            <StatCard
              icon={progress?.cooling ? <ShieldAlert className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              accent={progress?.cooling ? "#f59e0b" : "#10b981"}
              label="Tezlik" rawValue={progress?.cooling ? "sekin" : `${progress?.rate ?? 0}/s`}
              sub={progress?.cooling ? "anti-bot: sekinlashtirilmoqda" : running ? "jonli crawling" : "kutilmoqda"}
              pulse={running && !progress?.cooling}
            />
            <StatCard icon={<ShieldX className="w-4 h-4" />} accent={progress?.blocked ? "#ef4444" : "#52525b"} label="Bloklangan" value={progress?.blocked ?? 0} sub={progress?.blocked ? "anti-bot bloki" : "muammosiz"} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status line */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 text-sm text-[#a1a1aa] px-1"
          >
            <Loader2 className="w-4 h-4 text-[#8b5cf6] animate-spin flex-shrink-0" />
            <span>{statusMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-[#ef4444]/8 border border-[#ef4444]/25 px-4 py-3 flex items-start gap-2.5 text-sm text-[#fca5a5]">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Done banner */}
      {doneBanner && !error && (
        <div className="rounded-xl bg-[#10b981]/8 border border-[#10b981]/25 px-4 py-3 flex items-center gap-2.5 text-sm text-[#6ee7b7]">
          <Check className="w-4 h-4 flex-shrink-0" /> {doneBanner}
        </div>
      )}

      {/* Toolbar */}
      {products.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-[#71717a] mr-auto">Topildi: <b className="text-white">{products.length}</b> ta mahsulot</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#18181b] border border-[#27272a]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#52525b]" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-transparent text-xs font-medium text-[#a1a1aa] focus:outline-none cursor-pointer [&>option]:bg-[#18181b]"
            >
              <option value="rank">Topilish tartibi</option>
              <option value="weekly">Haftalik (ko'p → kam)</option>
              <option value="priceDesc">Narx (qimmat → arzon)</option>
              <option value="priceAsc">Narx (arzon → qimmat)</option>
            </select>
          </div>
          <button onClick={copyLinks} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#a1a1aa] hover:text-white transition-all">
            {copied ? <><Check className="w-3.5 h-3.5 text-[#10b981]" /> Nusxalandi</> : <><Copy className="w-3.5 h-3.5" /> Linklar</>}
          </button>
          <button onClick={exportXlsx} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10b981]/15 border border-[#10b981]/30 text-xs font-medium text-[#10b981] hover:bg-[#10b981]/25 transition-all">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      )}

      {/* Results + log */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* grid */}
        <div className="flex-1 min-w-0 w-full">
          {products.length === 0 ? (
            running ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden animate-pulse">
                    <div className="aspect-square bg-[#16161d]" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 rounded bg-[#16161d]" />
                      <div className="h-3 w-2/3 rounded bg-[#16161d]" />
                      <div className="h-4 w-1/2 rounded bg-[#16161d] mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !doneBanner ? (
              <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] py-20 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-3">
                  <Globe className="w-7 h-7 text-[#3f3f46]" />
                </div>
                <p className="text-sm font-semibold text-white">Kategoriya tahlili</p>
                <p className="text-xs text-[#52525b] mt-1 max-w-sm">Kategoriya havolasi va haftalik xaridorlar oralig'ini kiriting, so'ng "Qidirish" tugmasini bosing.</p>
              </div>
            ) : null
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {displayed.map((p) => {
                  const medal = MEDAL[p.rank];
                  return (
                    <motion.a
                      layout key={p.id}
                      href={p.url} target="_blank" rel="noopener noreferrer"
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="group rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden hover:border-[#8b5cf6]/40 hover:shadow-lg hover:shadow-[#8b5cf6]/5 transition-all"
                    >
                      <div className="relative aspect-square bg-[#18181b] overflow-hidden">
                        <span className={cn(
                          "absolute top-2 left-2 z-10 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
                          medal ? `${medal.bg} ${medal.text}` : "bg-[#8b5cf6] text-white",
                        )}>
                          {medal && <Trophy className="w-3 h-3" />}#{p.rank}
                        </span>
                        <span className="absolute top-2 right-2 z-10 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#10b981] text-white flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> {p.weekly}/hafta
                        </span>
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.title} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-[#3f3f46]" /></div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-2">
                        <p className="text-xs font-medium text-white leading-snug line-clamp-2 min-h-[2.4em]" title={p.title}>{p.title}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{fmtSom(p.price)}</span>
                          {p.rating ? <Stars rating={Number(p.rating)} /> : <span />}
                        </div>
                        <div className="flex items-center justify-end pt-1 border-t border-[#16161d]">
                          <span className="text-[11px] text-[#8b5cf6] font-semibold flex items-center gap-0.5 group-hover:gap-1.5 transition-all">Ochish <ExternalLink className="w-3 h-3" /></span>
                        </div>
                      </div>
                    </motion.a>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* log panel */}
        {(running || logs.length > 0) && (
          <aside className="w-full xl:w-80 flex-shrink-0 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden xl:sticky xl:top-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#18181b]">
              <h3 className="text-xs font-semibold text-[#71717a] uppercase tracking-wider flex items-center gap-2">
                {running && <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />}
                Tekshirilgan mahsulotlar
              </h3>
              <span className="text-xs text-[#8b5cf6] font-semibold">{logs.length ? logs[logs.length - 1].n : 0}</span>
            </div>
            <div ref={logBodyRef} className="max-h-[60vh] xl:max-h-[calc(100vh-12rem)] overflow-y-auto text-xs">
              {logs.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#141418]">
                  <span className="text-[10px] text-[#3f3f46] w-8 text-right flex-shrink-0">{l.n}</span>
                  <span className="flex-1 truncate text-[#a1a1aa]" title={l.title}>{l.title}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0",
                    l.state === "hit" && "bg-[#10b981]/15 text-[#10b981]",
                    l.state === "miss" && "bg-[#27272a] text-[#8b7fb0]",
                    l.state === "nowk" && "bg-[#18181b] text-[#52525b]",
                    l.state === "blocked" && "bg-[#f59e0b]/15 text-[#f59e0b]",
                  )}>
                    {l.state === "blocked" ? "bloklandi" : l.state === "nowk" ? "yo'q" : l.weekly}
                  </span>
                </div>
              ))}
              {!logs.length && <div className="py-8 text-center text-[11px] text-[#52525b]">Kutilmoqda…</div>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ── Xizmat holati badge ──────────────────────────────────────────────────── */
function ServiceBadge({ online, onRefresh }: { online: boolean | null; onRefresh: () => void }) {
  return (
    <button
      onClick={onRefresh}
      title="Xizmat holatini qayta tekshirish"
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-all group",
        online === null && "bg-[#18181b] border-[#27272a] text-[#71717a]",
        online === true && "bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]",
        online === false && "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]",
      )}
    >
      {online === null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{online === null ? "Tekshirilmoqda" : online ? "Xizmat faol" : "Xizmat o'chiq"}</span>
      <RefreshCw className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

/* ── KPI karta ────────────────────────────────────────────────────────────── */
function StatCard({
  icon, accent, label, value, rawValue, sub, footer, pulse,
}: {
  icon: React.ReactNode; accent: string; label: string;
  value?: number; rawValue?: string; sub?: string; footer?: React.ReactNode; pulse?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-[#71717a] font-semibold">{label}</span>
        <span className="relative w-7 h-7 flex items-center justify-center">
          {pulse && (
            <span className="absolute inset-0 rounded-lg animate-ping opacity-30" style={{ backgroundColor: accent }} />
          )}
          <span className="relative w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}1f`, color: accent }}>
            {icon}
          </span>
        </span>
      </div>
      <div className="text-2xl font-bold text-white tabular-nums">
        {rawValue !== undefined ? rawValue : <AnimatedNumber value={value ?? 0} />}
      </div>
      {sub && <p className="text-[11px] text-[#52525b] mt-0.5 truncate">{sub}</p>}
      {footer}
    </div>
  );
}
