"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Download,
  Plus,
  Filter,
  Calendar,
  FileSpreadsheet,
  File,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { mockReports, timeAgo } from "@/lib/mock-data";
import { cn, formatDate } from "@/lib/utils";
import type { ReportFormat, ReportType } from "@/types";

const formatIcon: Record<ReportFormat, React.ElementType> = {
  pdf:   FileText,
  excel: FileSpreadsheet,
  csv:   File,
};

const formatColor: Record<ReportFormat, string> = {
  pdf:   "#ef4444",
  excel: "#10b981",
  csv:   "#3b82f6",
};

const typeLabel: Record<ReportType, string> = {
  sales:     "Savdo",
  products:  "Mahsulotlar",
  finance:   "Moliya",
  inventory: "Inventar",
  orders:    "Buyurtmalar",
  custom:    "Maxsus",
};

const statusConfig = {
  ready:      { icon: CheckCircle2, label: "Tayyor",     color: "#10b981" },
  generating: { icon: RefreshCw,    label: "Tayyorlanmoqda", color: "#f59e0b", spin: true },
  failed:     { icon: XCircle,      label: "Xato",       color: "#ef4444" },
};

const reportTemplates = [
  { type: "sales" as ReportType, label: "Savdo hisoboti", desc: "Oylik savdo statistikasi", icon: FileText, color: "#8b5cf6" },
  { type: "finance" as ReportType, label: "Moliyaviy hisobot", desc: "Daromad, xarajat, foyda", icon: FileSpreadsheet, color: "#10b981" },
  { type: "products" as ReportType, label: "Mahsulotlar tahlili", desc: "Top mahsulotlar va marja", icon: File, color: "#3b82f6" },
  { type: "inventory" as ReportType, label: "Inventar holati", desc: "Zaxira va qiymat", icon: FileText, color: "#f59e0b" },
  { type: "orders" as ReportType, label: "Buyurtmalar", desc: "Buyurtmalar statistikasi", icon: FileText, color: "#ec4899" },
];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [activeTab, setActiveTab] = useState("history");

  const handleGenerate = async (type: ReportType) => {
    setGenerating(type);
    await new Promise((r) => setTimeout(r, 2000));
    setGenerating(null);
  };

  const tabs = [
    { id: "history", label: "Tarix" },
    { id: "create", label: "Yaratish" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hisobotlar"
        subtitle="Eksport va tahlil hisobotlari"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Jami hisobot", value: mockReports.length.toString(), color: "#8b5cf6" },
              { label: "Tayyor", value: mockReports.filter((r) => r.status === "ready").length.toString(), color: "#10b981" },
              { label: "Jarayonda", value: mockReports.filter((r) => r.status === "generating").length.toString(), color: "#f59e0b" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4 text-center"
              >
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-[#52525b] mt-1">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Reports list */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#18181b]">
              <h2 className="text-sm font-semibold text-white">Hisobotlar tarixi</h2>
            </div>
            <div className="divide-y divide-[#18181b]">
              {mockReports.map((report, i) => {
                const FmtIcon = formatIcon[report.format] || FileText;
                const fmtColor = formatColor[report.format];
                const statusCfg = statusConfig[report.status];
                const StatusIcon = statusCfg.icon;

                return (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-[#18181b]/40 transition-colors group"
                  >
                    {/* Format icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${fmtColor}18` }}
                    >
                      <FmtIcon className="w-5 h-5" style={{ color: fmtColor }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{report.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-[#52525b]">{typeLabel[report.type]}</span>
                        <span className="text-[11px] text-[#3f3f46]">{report.size}</span>
                        <span className="text-[11px] text-[#3f3f46] flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(report.dateRange.from)} – {formatDate(report.dateRange.to)}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={cn("flex items-center gap-1.5 text-xs font-semibold", )} style={{ color: statusCfg.color }}>
                      <StatusIcon className={cn("w-3.5 h-3.5", "spin" in statusCfg && statusCfg.spin && "animate-spin")} />
                      <span className="hidden sm:block">{statusCfg.label}</span>
                    </div>

                    {/* Date */}
                    <span className="text-[11px] text-[#3f3f46] hidden md:block flex-shrink-0">{timeAgo(report.createdAt)}</span>

                    {/* Download */}
                    {report.status === "ready" && (
                      <button className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] text-xs text-[#71717a] hover:text-white hover:bg-[#27272a] transition-all">
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:block">Yuklab olish</span>
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === "create" && (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {reportTemplates.map((template, i) => {
              const TemplateIcon = template.icon;
              const isGenerating = generating === template.type;
              return (
                <motion.div
                  key={template.type}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-5 hover:border-[#27272a] transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${template.color}18` }}>
                    <TemplateIcon className="w-5 h-5" style={{ color: template.color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{template.label}</h3>
                  <p className="text-xs text-[#52525b] mb-5">{template.desc}</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {["PDF", "Excel", "CSV"].map((fmt) => (
                        <button
                          key={fmt}
                          className="flex-1 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-[#71717a] hover:text-white hover:border-[#3f3f46] transition-all"
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handleGenerate(template.type)}
                      disabled={isGenerating}
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ background: `${template.color}18`, color: template.color }}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Tayyorlanmoqda...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Yaratish
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
