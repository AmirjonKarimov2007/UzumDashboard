"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricData } from "@/types";

interface MetricCardProps {
  data: MetricData;
  index?: number;
  className?: string;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 36;
  const w = 80;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * h,
  ]);
  const path = pts
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts[pts.length - 1] && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
      )}
    </svg>
  );
}

export function MetricCard({ data, index = 0, className }: MetricCardProps) {
  const positive = data.change > 0;
  const neutral = data.change === 0;

  const accentColor = data.color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 4) * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "metric-card group relative overflow-hidden rounded-[18px] p-4 sm:p-5",
        className
      )}
    >
      <div className="relative flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Icon */}
          <div
            className="mb-4 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[11px]"
            style={{ background: `color-mix(in srgb, ${accentColor} 13%, transparent)`, color: accentColor }}
          >
            <data.icon className="w-4.5 h-4.5" style={{ color: accentColor }} />
          </div>

          {/* Value */}
          <div className="mb-1">
            <span className="text-2xl font-extrabold tracking-[-0.035em] text-[var(--text-primary)] tabular-nums sm:text-[26px]">
              {data.prefix && <span className="mr-0.5 text-base font-medium text-[var(--text-muted)]">{data.prefix}</span>}
              {data.value}
              {data.suffix && <span className="ml-1 text-xs font-semibold text-[var(--text-muted)]">{data.suffix}</span>}
            </span>
          </div>

          {/* Label */}
          <p className="text-xs font-semibold text-[var(--text-secondary)]">{data.title}</p>

          {/* Trend */}
          <div className="flex items-center gap-1.5 mt-2.5 sm:mt-3 flex-wrap">
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                positive
                  ? "bg-[#10b981]/12 text-[#10b981]"
                  : neutral
                  ? "bg-[#71717a]/12 text-[#71717a]"
                  : "bg-[#ef4444]/12 text-[#ef4444]"
              )}
            >
              {positive ? (
                <TrendingUp className="w-3 h-3" />
              ) : neutral ? (
                <Minus className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{Math.abs(data.change)}%</span>
            </div>
            <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">
              {data.changeLabel || "avvalgiga nisbatan"}
            </span>
          </div>
        </div>

        {/* Sparkline — mobilda yashirinadi (keraksiz bezak) */}
        <div className="hidden flex-shrink-0 opacity-75 sm:block">
          <Sparkline data={data.sparkline} color={accentColor} />
        </div>
      </div>
    </motion.div>
  );
}
