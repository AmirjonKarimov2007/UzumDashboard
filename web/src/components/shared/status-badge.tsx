import { cn } from "@/lib/utils";
import type { OrderStatus, ProductStatus } from "@/types";

type BadgeVariant = OrderStatus | ProductStatus | "in_stock" | "low_stock" | "out_of_stock" | "overstock" | "active" | "invited" | "suspended";

const config: Record<string, { label: string; className: string }> = {
  // Order statuses
  pending:     { label: "Kutilmoqda",  className: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" },
  processing:  { label: "Jarayonda",   className: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20" },
  shipped:     { label: "Yuborildi",   className: "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20" },
  delivered:   { label: "Yetkazildi",  className: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  cancelled:   { label: "Bekor",       className: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20" },
  refunded:    { label: "Qaytarildi",  className: "bg-[#71717a]/10 text-[#71717a] border-[#71717a]/20" },
  // Product statuses
  active:      { label: "Faol",        className: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  paused:      { label: "To'xtatildi", className: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" },
  out_of_stock:{ label: "Tugagan",     className: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20" },
  // Inventory
  in_stock:    { label: "Mavjud",      className: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  low_stock:   { label: "Kam qoldi",   className: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" },
  overstock:   { label: "Ko'p",        className: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20" },
  // Team
  invited:     { label: "Taklif",      className: "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20" },
  suspended:   { label: "Bloklangan",  className: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20" },
};

interface StatusBadgeProps {
  status: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, className, dot = true }: StatusBadgeProps) {
  const cfg = config[status] ?? { label: status, className: "bg-[#27272a] text-[#71717a] border-[#27272a]" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
        cfg.className,
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {cfg.label}
    </span>
  );
}
