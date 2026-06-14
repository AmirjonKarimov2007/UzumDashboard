"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  Menu,
  Bell,
  Sparkles,
  BarChart3,
  Boxes,
  Users,
  FileText,
  Settings,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useState } from "react";

const primaryTabs = [
  { name: "Asosiy",      href: "/dashboard",  icon: LayoutDashboard },
  { name: "Buyurtmalar", href: "/orders",      icon: ShoppingCart },
  { name: "Mahsulotlar", href: "/products",    icon: Package },
  { name: "Moliya",      href: "/finance",     icon: Wallet },
];

const moreItems = [
  { name: "Analitika",       href: "/analytics",      icon: BarChart3 },
  { name: "Qaytarishlar",    href: "/returns",        icon: RotateCcw },
  { name: "Inventar",        href: "/inventory",      icon: Boxes },
  { name: "AI Tahlil",       href: "/ai",             icon: Sparkles, badge: "Pro" },
  { name: "Bildirishnomalar", href: "/notifications", icon: Bell },
  { name: "Jamoa",           href: "/team",           icon: Users },
  { name: "Hisobotlar",      href: "/reports",        icon: FileText },
  { name: "Sozlamalar",      href: "/settings",       icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const isMoreActive = moreItems.some((i) => isActive(i.href));

  return (
    <>
      {/* More drawer overlay */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="fixed bottom-[72px] left-0 right-0 z-50 mx-3 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] shadow-elevated overflow-hidden lg:hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#18181b]">
                <span className="text-xs font-semibold text-[#71717a] uppercase tracking-widest">Ko'proq</span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[#18181b] text-[#71717a] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-0.5 p-2">
                {moreItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all",
                        active
                          ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                          : "text-[#71717a] hover:text-white hover:bg-[#18181b]"
                      )}
                    >
                      <div className="relative">
                        <item.icon className={cn("w-5 h-5", active ? "text-[#8b5cf6]" : "")} />
                      </div>
                      <span className="text-[10px] font-medium leading-tight text-center">{item.name}</span>
                      {"badge" in item && item.badge && (
                        <span className="absolute top-2 right-2 text-[8px] font-bold px-1 py-0.5 rounded-full bg-[#8b5cf6]/30 text-[#a78bfa] leading-none">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
        {/* Blur backdrop */}
        <div className="absolute inset-0 bg-[#09090b]/90 backdrop-blur-xl border-t border-[#18181b]" />

        <div className="relative flex items-center h-[68px] px-2 safe-area-pb">
          {primaryTabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
              >
                <div className="relative">
                  {active && (
                    <motion.div
                      layoutId="mobile-active-bg"
                      className="absolute inset-0 -m-2 rounded-xl bg-[#8b5cf6]/15"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <tab.icon
                    className={cn(
                      "w-5 h-5 relative z-10 transition-colors",
                      active ? "text-[#8b5cf6]" : "text-[#52525b]"
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    active ? "text-[#a78bfa]" : "text-[#52525b]"
                  )}
                >
                  {tab.name}
                </span>
                {active && (
                  <motion.div
                    layoutId="mobile-active-dot"
                    className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#8b5cf6]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
          >
            <div className={cn(
              "w-5 h-5 flex items-center justify-center transition-colors",
              (moreOpen || isMoreActive) ? "text-[#8b5cf6]" : "text-[#52525b]"
            )}>
              <Menu className="w-5 h-5" />
            </div>
            <span className={cn(
              "text-[10px] font-medium transition-colors",
              (moreOpen || isMoreActive) ? "text-[#a78bfa]" : "text-[#52525b]"
            )}>
              Ko'proq
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
