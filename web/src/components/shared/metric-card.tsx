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
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "group relative rounded-2xl p-4 sm:p-5 bg-[#0f0f16] border border-[#1c1c24] overflow-hidden",
        "hover:border-[#27272a] transition-all duration-300",
        "shadow-card hover:shadow-card-hover",
        className
      )}
    >
      {/* Subtle top gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }}
      />

      {/* Background glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 20% 50%, ${accentColor}08 0%, transparent 60%)` }}
      />

      <div className="relative flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 sm:mb-4 flex-shrink-0"
            style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}25` }}
          >
            <data.icon className="w-4.5 h-4.5" style={{ color: accentColor }} />
          </div>

          {/* Value */}
          <div className="mb-1">
            <span className="text-xl sm:text-2xl font-bold text-white tracking-tight tabular-nums">
              {data.prefix && <span className="text-lg text-[#71717a] font-normal mr-0.5">{data.prefix}</span>}
              {data.value}
              {data.suffix && <span className="text-sm text-[#71717a] font-normal ml-0.5">{data.suffix}</span>}
            </span>
          </div>

          {/* Label */}
          <p className="text-xs text-[#71717a] font-medium">{data.title}</p>

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
            <span className="hidden sm:inline text-[11px] text-[#3f3f46]">
              {data.changeLabel || "avvalgiga nisbatan"}
            </span>
          </div>
        </div>

        {/* Sparkline — mobilda yashirinadi (keraksiz bezak) */}
        <div className="hidden sm:block flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <Sparkline data={data.sparkline} color={accentColor} />
        </div>
      </div>
    </motion.div>
  );
}
