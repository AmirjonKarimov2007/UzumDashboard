import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-[#5b21b6] text-white",
        secondary: "bg-[#1c1c21] text-[#a1a1aa]",
        success: "bg-[#10b981] text-white",
        warning: "bg-[#f59e0b] text-white",
        error: "bg-[#ef4444] text-white",
        info: "bg-[#3b82f6] text-white",
        outline: "border border-[#27272a] text-[#a1a1aa]",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };