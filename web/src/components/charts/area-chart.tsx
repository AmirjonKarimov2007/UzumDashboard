"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ChartDataPoint } from "@/types";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatter?: (value: number) => string;
}

function CustomTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-[#0f0f16] border border-[#27272a] p-3 shadow-elevated min-w-[140px]">
      <p className="text-xs text-[#71717a] mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-xs text-[#a1a1aa]">{p.name}</span>
          </div>
          <span className="text-xs font-semibold text-white">
            {formatter ? formatter(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

interface RevenueAreaChartProps {
  data: ChartDataPoint[];
  primaryKey?: string;
  secondaryKey?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  formatter?: (value: number) => string;
  height?: number;
}

export function RevenueAreaChart({
  data,
  primaryKey = "value",
  secondaryKey = "secondary",
  primaryLabel = "Daromad",
  secondaryLabel = "Foyda",
  primaryColor = "#8b5cf6",
  secondaryColor = "#10b981",
  formatter,
  height = 260,
}: RevenueAreaChartProps) {
  const hasSecondary = data.some((d) => d[secondaryKey] !== undefined);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-primary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-secondary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={secondaryColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: "#52525b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tick={{ fill: "#52525b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => {
            if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(0)}B`;
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
            if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
            return String(v);
          }}
        />
        <Tooltip
          content={<CustomTooltip formatter={formatter} />}
          cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
        />
        {hasSecondary && (
          <Legend
            wrapperStyle={{ paddingTop: 12, fontSize: 11 }}
            formatter={(value) => <span style={{ color: "#71717a" }}>{value}</span>}
          />
        )}
        <Area
          type="monotone"
          dataKey={primaryKey}
          name={primaryLabel}
          stroke={primaryColor}
          strokeWidth={2}
          fill="url(#grad-primary)"
          dot={false}
          activeDot={{ r: 4, fill: primaryColor, strokeWidth: 0 }}
        />
        {hasSecondary && (
          <Area
            type="monotone"
            dataKey={secondaryKey}
            name={secondaryLabel}
            stroke={secondaryColor}
            strokeWidth={2}
            fill="url(#grad-secondary)"
            dot={false}
            activeDot={{ r: 4, fill: secondaryColor, strokeWidth: 0 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
