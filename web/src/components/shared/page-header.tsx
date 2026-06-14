"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  tabs?: { id: string; label: string; count?: number }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  action,
  tabs,
  activeTab,
  onTabChange,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("mb-4 sm:mb-6", className)}
    >
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-[#71717a] mt-0.5 sm:mt-1 truncate">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {tabs && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#18181b] border border-[#27272a] w-full sm:w-fit overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0",
                activeTab === tab.id
                  ? "bg-[#27272a] text-white shadow-sm"
                  : "text-[#71717a] hover:text-[#a1a1aa]"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    activeTab === tab.id
                      ? "bg-[#3f3f46] text-[#a1a1aa]"
                      : "bg-[#27272a] text-[#52525b]"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
