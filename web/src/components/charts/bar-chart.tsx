"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
    <div className="rounded-xl bg-[#0f0f16] border border-[#27272a] p-3 shadow-elevated min-w-[120px]">
      <p className="text-xs text-[#71717a] mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
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

interface SalesBarChartProps {
  data: ChartDataPoint[];
  dataKey?: string;
  label?: string;
  color?: string;
  formatter?: (value: number) => string;
  height?: number;
  horizontal?: boolean;
  highlightLast?: boolean;
}

export function SalesBarChart({
  data,
  dataKey = "value",
  label = "Sotuv",
  color = "#8b5cf6",
  formatter,
  height = 220,
  horizontal = false,
  highlightLast = false,
}: SalesBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 4, left: horizontal ? 80 : -16, bottom: 0 }}
        barSize={horizontal ? 8 : 20}
      >
        <CartesianGrid
          strokeDasharray="0"
          stroke="rgba(255,255,255,0.04)"
          horizontal={!horizontal}
          vertical={horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={{ fill: "#52525b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(v);
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
          </>
        ) : (
          <>
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
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(v);
              }}
            />
          </>
        )}
        <Tooltip
          content={<CustomTooltip formatter={formatter} />}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar dataKey={dataKey} name={label} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={highlightLast && i === data.length - 1 ? color : `${color}80`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
