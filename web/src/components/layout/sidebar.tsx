"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Bell, Boxes, ChevronDown, FileText, Globe2, LayoutDashboard,
  LogOut, Package, PackageCheck, QrCode, RotateCcw, Settings, ShoppingCart,
  Store, Users, Wallet, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-users";

const navigation = [
  {
    group: "Ish maydoni",
    items: [
      { name: "Bosh sahifa", href: "/dashboard", icon: LayoutDashboard },
      { name: "Analitika", href: "/analytics", icon: BarChart3 },
      { name: "Global tahlil", href: "/global-analysis", icon: Globe2, badge: "Beta" },
    ],
  },
  {
    group: "Operatsiyalar",
    items: [
      { name: "Buyurtmalar", href: "/orders", icon: ShoppingCart },
      { name: "Mahsulotlar", href: "/products", icon: Package },
      { name: "Ta’minlashlar", href: "/supplies", icon: Boxes },
      { name: "FBO ta’minlash", href: "/fbo-supplies", icon: PackageCheck },
      { name: "Qaytarishlar", href: "/returns", icon: RotateCcw },
      { name: "Inventar", href: "/inventory", icon: Boxes },
      { name: "Yorliqlar", href: "/labels", icon: QrCode },
    ],
  },
  {
    group: "Nazorat",
    items: [
      { name: "Moliya", href: "/finance", icon: Wallet },
      { name: "Hisobotlar", href: "/reports", icon: FileText },
      { name: "Bildirishnomalar", href: "/notifications", icon: Bell },
      { name: "Jamoa", href: "/team", icon: Users },
      { name: "Sozlamalar", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useDashboardStore();
  const { user, activeStoreId, logout } = useAuthStore();
  const activeStore = user?.stores.find((store) => store.id === activeStoreId);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarCollapsed(true);
  };

  return (
    <>
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.button
            type="button"
            aria-label="Menyuni yopish"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#080b13]/55 backdrop-blur-[2px] lg:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: sidebarCollapsed ? -288 : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
        className="dashboard-sidebar fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col lg:z-30"
        aria-label="Asosiy navigatsiya"
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between px-4">
          <Link href="/dashboard" onClick={closeOnMobile} className="group flex min-w-0 items-center gap-3 rounded-xl">
            <span className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]">
              <Zap className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">Seller Hub</span>
              <span className="mt-0.5 block text-[11px] font-medium text-[var(--text-muted)]">Uzum operatsiyalar markazi</span>
            </span>
          </Link>
          <button type="button" onClick={() => setSidebarCollapsed(true)} className="icon-button lg:hidden" aria-label="Menyuni yopish">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button type="button" className="store-switcher group w-full">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{activeStore?.name || "Do‘kon tanlanmagan"}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{activeStore?.plan ? `${activeStore.plan} tarif` : "Uzum Marketplace"}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-y-0.5" />
          </button>
        </div>

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {me?.isSuperAdmin && (
            <Link href="/super-admin" onClick={closeOnMobile} className="sidebar-admin-link">
              <Users className="h-4 w-4" />
              <span>Super-admin</span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            </Link>
          )}

          {navigation.map((section) => (
            <section key={section.group} className="mt-4 first:mt-1">
              <h2 className="mb-1 px-3 text-[11px] font-semibold text-[var(--text-muted)]">{section.group}</h2>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={closeOnMobile} aria-current={active ? "page" : undefined} className={cn("sidebar-link", active && "is-active")}>
                      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.3 : 1.8} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {"badge" in item && item.badge && <span className="sidebar-badge">{item.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="shrink-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="user-panel group">
            <div className="avatar-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold">
              {user?.name?.slice(0, 2).toUpperCase() || user?.phone?.slice(-2) || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{user?.name || "Foydalanuvchi"}</p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{user?.phone}</p>
            </div>
            <button type="button" onClick={logout} title="Tizimdan chiqish" className="logout-button" aria-label="Tizimdan chiqish">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
