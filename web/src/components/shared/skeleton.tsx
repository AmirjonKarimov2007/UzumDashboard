import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-shimmer rounded-lg bg-[#18181b]", className)} />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl p-5 bg-[#0f0f16] border border-[#1c1c24]", className)}>
      <Skeleton className="w-9 h-9 rounded-xl mb-4" />
      <Skeleton className="w-24 h-7 mb-2" />
      <Skeleton className="w-16 h-3" />
      <Skeleton className="w-20 h-5 mt-4 rounded-full" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn("h-4", i === 0 ? "w-32" : i === cols - 1 ? "w-12" : "w-20")} />
        </td>
      ))}
    </tr>
  );
}

export function MetricGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
