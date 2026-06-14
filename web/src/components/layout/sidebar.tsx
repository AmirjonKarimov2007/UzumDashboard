"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  ShoppingCart,
  Wallet,
  Boxes,
  Bell,
  Sparkles,
  Users,
  FileText,
  Settings,
  ChevronDown,
  Store,
  LogOut,
  Zap,
  QrCode,
  Globe,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useAuthStore } from "@/stores/auth-store";

const navigation = [
  {
    group: "Asosiy",
    items: [
      { name: "Bosh sahifa", href: "/dashboard", icon: LayoutDashboard },
      { name: "Analitika", href: "/analytics", icon: BarChart3 },
      { name: "Global Analiz", href: "/global-analysis", icon: Globe, badge: "Beta" },
    ],
  },
  {
    group: "Savdo",
    items: [
      { name: "Mahsulotlar", href: "/products", icon: Package },
      { name: "Buyurtmalar", href: "/orders", icon: ShoppingCart },
      { name: "Qaytarishlar", href: "/returns", icon: RotateCcw },
      { name: "Yorliqlar", href: "/labels", icon: QrCode },
      { name: "Inventar", href: "/inventory", icon: Boxes },
    ],
  },
  {
    group: "Moliya va AI",
    items: [
      { name: "Moliya", href: "/finance", icon: Wallet },
      { name: "AI Tahlil", href: "/ai", icon: Sparkles, badge: "Pro" },
      { name: "Hisobotlar", href: "/reports", icon: FileText },
    ],
  },
  {
    group: "Boshqaruv",
    items: [
      { name: "Bildirishnomalar", href: "/notifications", icon: Bell },
      { name: "Jamoa", href: "/team", icon: Users },
      { name: "Sozlamalar", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useDashboardStore();
  const { user, activeStoreId, logout } = useAuthStore();

  const activeStore = user?.stores.find((s) => s.id === activeStoreId);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: sidebarCollapsed ? -280 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className="fixed left-0 top-0 h-dvh w-[248px] flex flex-col bg-[#0a0a0f] border-r border-[#18181b] z-50 lg:z-30"
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-[#18181b] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-lg flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white tracking-tight">Uzum</span>
              <span className="text-[#71717a] text-xs block leading-none mt-0.5">Seller Hub</span>
            </div>
          </div>
        </div>

        {/* Store selector */}
        {activeStore && (
          <div className="px-3 py-2.5 border-b border-[#18181b] flex-shrink-0">
            <button className="w-full group flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#0f0f16] transition-colors">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                <Store className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium text-[#e4e4e7] truncate">{activeStore.name}</p>
                <p className="text-[10px] text-[#71717a]">{activeStore.plan || "Free"} plan</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#52525b] flex-shrink-0" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-none py-3">
          {navigation.map((section) => (
            <div key={section.group} className="mb-4">
              <p className="px-4 mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-widest">
                {section.group}
              </p>
              <div className="px-2 space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        if (window.innerWidth < 1024) setSidebarCollapsed(true);
                      }}
                      className={cn(
                        "group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                          : "text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#0f0f16]"
                      )}
                    >
                      {active && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-lg bg-[#8b5cf6]/12"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          "w-4 h-4 flex-shrink-0 relative z-10 transition-colors",
                          active ? "text-[#8b5cf6]" : "text-[#52525b] group-hover:text-[#a1a1aa]"
                        )}
                      />
                      <span className="relative z-10 flex-1">{item.name}</span>
                      {"badge" in item && item.badge && (
                        <span className="relative z-10 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#8b5cf6]/20 text-[#a78bfa]">
                          {item.badge}
                        </span>
                      )}
                      {active && (
                        <div className="absolute left-0 inset-y-0 w-0.5 rounded-full bg-[#8b5cf6]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-3 border-t border-[#18181b] flex-shrink-0">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#0f0f16] transition-colors group cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              {user?.name?.slice(0, 2).toUpperCase() || user?.phone?.slice(-2) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#e4e4e7] truncate">
                {user?.name || "Foydalanuvchi"}
              </p>
              <p className="text-[10px] text-[#52525b] truncate">{user?.phone}</p>
            </div>
            <button
              onClick={logout}
              title="Chiqish"
              className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#ef4444]/10 transition-all text-[#52525b] hover:text-[#ef4444]"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
