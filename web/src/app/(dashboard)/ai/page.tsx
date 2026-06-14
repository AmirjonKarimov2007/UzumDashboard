"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Target,
  ArrowRight,
  X,
  Brain,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { mockAIInsights, formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { InsightType } from "@/types";

const typeConfig: Record<InsightType, { icon: React.ElementType; color: string }> = {
  dead_product:      { icon: TrendingDown, color: "#ef4444" },
  price_optimization:{ icon: Target,       color: "#f59e0b" },
  stock_alert:       { icon: AlertTriangle,color: "#f59e0b" },
  trend:             { icon: TrendingUp,   color: "#10b981" },
  competitor:        { icon: Activity,     color: "#3b82f6" },
  opportunity:       { icon: Lightbulb,    color: "#8b5cf6" },
};

const severityConfig = {
  critical: { label: "Kritik",  cls: "bg-[#ef4444]/12 text-[#ef4444] border-[#ef4444]/20" },
  high:     { label: "Yuqori",  cls: "bg-[#f59e0b]/12 text-[#f59e0b] border-[#f59e0b]/20" },
  medium:   { label: "O'rta",   cls: "bg-[#3b82f6]/12 text-[#3b82f6] border-[#3b82f6]/20" },
  low:      { label: "Past",    cls: "bg-[#10b981]/12 text-[#10b981] border-[#10b981]/20" },
};

export default function AIPage() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<InsightType | "all">("all");

  const visible = mockAIInsights.filter(
    (i) =>
      !dismissed.includes(i.id) && (activeFilter === "all" || i.type === activeFilter)
  );

  const totalPotential = visible.reduce((s, i) => s + (i.potentialGain || 0), 0);
  const criticalCount = visible.filter(
    (i) => i.severity === "critical" || i.severity === "high"
  ).length;

  const filters: { id: InsightType | "all"; label: string }[] = [
    { id: "all",               label: "Barchasi" },
    { id: "dead_product",      label: "O'lik mahsulot" },
    { id: "price_optimization",label: "Narx" },
    { id: "stock_alert",       label: "Zaxira" },
    { id: "trend",             label: "Trend" },
    { id: "opportunity",       label: "Imkoniyat" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Tahlil"
        subtitle="Aqlli tavsiyalar va bashoratlar"
        action={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8b5cf6]/12 border border-[#8b5cf6]/20">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
            <span className="text-xs text-[#a78bfa] font-medium">AI faol</span>
          </div>
        }
      />

      {/* AI status banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-r from-[#8b5cf6]/10 via-[#6d28d9]/8 to-transparent border border-[#8b5cf6]/20 p-5"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#8b5cf6]/20 flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-[#a78bfa]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AI Tahlil tizimi</h3>
              <p className="text-xs text-[#71717a] mt-0.5">
                {mockAIInsights.length} ta tavsiya tayyorlandi. Potensial daromad:&nbsp;
                <span className="text-[#10b981] font-semibold">{formatCurrency(totalPotential)}</span>
              </p>
            </div>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ef4444]/12 border border-[#ef4444]/20">
              <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
              <span className="text-xs text-[#ef4444] font-semibold">{criticalCount} ta muhim</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
              activeFilter === f.id
                ? "bg-[#8b5cf6] text-white"
                : "bg-[#0f0f16] border border-[#27272a] text-[#71717a] hover:text-white"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Insights list */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {visible.map((insight, i) => {
            const type = typeConfig[insight.type];
            const severity = severityConfig[insight.severity];
            const TypeIcon = type.icon;

            return (
              <motion.div
                key={insight.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, x: -20 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden hover:border-[#27272a] transition-colors group"
              >
                <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${type.color}80, transparent)` }} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${type.color}18` }}
                      >
                        <TypeIcon className="w-5 h-5" style={{ color: type.color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-sm font-semibold text-white">{insight.title}</h3>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", severity.cls)}>
                            {severity.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#71717a]">{insight.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setDismissed((d) => [...d, insight.id])}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#27272a] text-[#52525b] hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl bg-[#18181b] p-3">
                      <p className="text-[11px] text-[#52525b] mb-1">Ta'sir</p>
                      <p className="text-xs font-semibold text-[#ef4444]">{insight.impact}</p>
                    </div>
                    <div className="rounded-xl bg-[#18181b] p-3">
                      <p className="text-[11px] text-[#52525b] mb-1">Tavsiya</p>
                      <p className="text-xs font-semibold text-white">{insight.recommendation}</p>
                    </div>
                    <div className="rounded-xl bg-[#18181b] p-3">
                      <p className="text-[11px] text-[#52525b] mb-1">Potensial daromad</p>
                      <p className="text-xs font-semibold text-[#10b981]">
                        {insight.potentialGain ? `+${formatCurrency(insight.potentialGain)}` : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1 bg-[#27272a] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#8b5cf6] rounded-full"
                            style={{ width: `${insight.confidence}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-[#52525b]">{insight.confidence}% aniqlik</span>
                      </div>
                      {insight.affectedProduct && (
                        <span className="text-[11px] text-[#52525b] truncate max-w-[160px]">
                          📦 {insight.affectedProduct}
                        </span>
                      )}
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8b5cf6]/12 hover:bg-[#8b5cf6]/20 text-[#a78bfa] text-xs font-semibold transition-all">
                      Qabul qilish
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {visible.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-5">
              <Sparkles className="w-8 h-8 text-[#8b5cf6]" />
            </div>
            <h3 className="text-sm font-semibold text-[#a1a1aa]">Barcha tavsiyalar ko'rib chiqildi</h3>
            <p className="text-xs text-[#52525b] mt-2">AI yangi tavsiyalar tayyorlaganda bu yerda paydo bo'ladi</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
