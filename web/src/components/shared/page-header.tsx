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
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn("page-heading mb-5 sm:mb-7", className)}
    >
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-5 sm:flex-row sm:gap-5">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.035em] text-[var(--text-primary)] sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--text-secondary)] sm:text-sm">{subtitle}</p>}
        </div>
        {action && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{action}</div>}
      </div>

      {tabs && (
        <div className="segmented-control flex w-full items-center gap-1 overflow-x-auto p-1 scrollbar-none sm:w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                "flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    activeTab === tab.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--fill)] text-[var(--text-muted)]"
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
