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
  BarChart3,
  Boxes,
  Users,
  FileText,
  Settings,
  RotateCcw,
  X,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useState } from "react";
import { useMe } from "@/hooks/use-users";

const primaryTabs = [
  { name: "Asosiy",      href: "/dashboard",  icon: LayoutDashboard },
  { name: "Buyurtmalar", href: "/orders",      icon: ShoppingCart },
  { name: "Mahsulotlar", href: "/products",    icon: Package },
  { name: "Ta’minlashlar", href: "/supplies",   icon: Boxes },
];

const moreItems = [
  { name: "FBO ta’minlashlar", href: "/fbo-supplies", icon: PackageCheck },
  { name: "Moliya",         href: "/finance",        icon: Wallet },
  { name: "Analitika",       href: "/analytics",      icon: BarChart3 },
  { name: "Qaytarishlar",    href: "/returns",        icon: RotateCcw },
  { name: "Inventar",        href: "/inventory",      icon: Boxes },
  { name: "Bildirishnomalar", href: "/notifications", icon: Bell },
  { name: "Jamoa",           href: "/team",           icon: Users },
  { name: "Hisobotlar",      href: "/reports",        icon: FileText },
  { name: "Sozlamalar",      href: "/settings",       icon: Settings },
];

export function MobileNav() {
  const { data: me } = useMe();
  const menuItems = me?.isSuperAdmin ? [...moreItems, { name: 'Super-admin', href: '/super-admin', icon: Users }] : moreItems;
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isMoreActive = menuItems.some((i) => isActive(i.href));

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
              className="fixed inset-0 z-40 bg-[#080b13]/55 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="mobile-more-panel fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 overflow-hidden lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3.5">
                <div>
                  <span className="block text-sm font-bold text-[var(--text-primary)]">Barcha bo‘limlar</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Kerakli ish maydoniga o‘ting</span>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="icon-button"
                  aria-label="Qo‘shimcha menyuni yopish"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid max-h-[min(58vh,440px)] grid-cols-3 gap-1 overflow-y-auto p-2.5 sm:grid-cols-4">
                {menuItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "mobile-more-link relative flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 transition-colors",
                        active
                          ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                          : "text-[#71717a] hover:text-white hover:bg-[#18181b]"
                      )}
                    >
                      <div className="relative">
                        <item.icon className={cn("w-5 h-5", active ? "text-[#8b5cf6]" : "")} />
                      </div>
                      <span className="text-[10px] font-medium leading-tight text-center">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <div className="mobile-dock fixed bottom-0 left-0 right-0 z-40 lg:hidden">
        <div className="relative flex h-[68px] items-center px-1.5 pb-1 pt-1">
          {primaryTabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn("mobile-dock-link flex-1", active && "is-active")}
                aria-current={active ? "page" : undefined}
              >
                <div className="relative">
                  {active && (
                    <motion.div
                      layoutId="mobile-active-bg"
                      className="absolute inset-0 -m-2 rounded-xl bg-[var(--accent-soft)]"
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
                    "text-[10px] font-semibold transition-colors",
                    active ? "text-[#a78bfa]" : "text-[#52525b]"
                  )}
                >
                  {tab.name}
                </span>
                {active && (
                  <motion.div
                    layoutId="mobile-active-dot"
                    className="absolute -bottom-2.5 h-1 w-1 rounded-full bg-[var(--accent)]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn("mobile-dock-link flex-1", (moreOpen || isMoreActive) && "is-active")}
            aria-label="Barcha bo‘limlar"
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
