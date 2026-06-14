"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface DonutDataItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: DonutDataItem }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl bg-[#0f0f16] border border-[#27272a] p-3 shadow-elevated">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.payload.color }} />
        <span className="text-xs text-[#a1a1aa]">{item.name}</span>
      </div>
      <p className="text-sm font-bold text-white mt-1">{item.value}%</p>
    </div>
  );
}

interface DonutChartProps {
  data: DonutDataItem[];
  innerLabel?: string;
  innerValue?: string;
  height?: number;
}

export function DonutChart({ data, innerLabel, innerValue, height = 200 }: DonutChartProps) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      {(innerLabel || innerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {innerValue && (
            <span className="text-xl font-bold text-white leading-none">{innerValue}</span>
          )}
          {innerLabel && (
            <span className="text-[11px] text-[#71717a] mt-1">{innerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Legend component for donut charts
export function DonutLegend({ data }: { data: DonutDataItem[] }) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.name} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-xs text-[#71717a]">{item.name}</span>
          </div>
          <span className="text-xs font-semibold text-[#a1a1aa]">{item.value}%</span>
        </div>
      ))}
    </div>
  );
}
