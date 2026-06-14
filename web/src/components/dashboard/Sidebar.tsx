"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Wallet,
  Sparkles,
  Settings,
  HelpCircle,
  ChevronDown,
  Menu,
  Bell,
  Search,
  User,
  LogOut,
  X,
  Store,
  Clock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useAuthStore } from "@/stores/auth-store";

const mainNavigation = [
  { name: "Bosh sahifa", href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { name: "Analitika", href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { name: "Mahsulotlar", href: "/dashboard/products", icon: Package, label: "Products" },
  { name: "Moliya", href: "/dashboard/finance", icon: Wallet, label: "Finance" },
  { name: "AI Tahlil", href: "/dashboard/ai", icon: Sparkles, label: "AI Insights" },
];

const secondaryNavigation = [
  { name: "Sozlamalar", href: "/dashboard/settings", icon: Settings, label: "Settings" },
  { name: "Yordam", href: "/dashboard/help", icon: HelpCircle, label: "Help" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useDashboardStore();
  const { user, activeStoreId, logout } = useAuthStore();

  const activeStore = user?.stores.find((s) => s.id === activeStoreId);

  const isDashboardPath = pathname.startsWith("/dashboard");

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-[#0a0a0f] border border-[#27272a] shadow-lg transition-all duration-250",
          !sidebarCollapsed && "left-64"
        )}
      >
        {!sidebarCollapsed ? <X className="w-5 h-5 text-[#fafafa]" /> : <Menu className="w-5 h-5 text-[#fafafa]" />}
      </button>

      {/* Mobile Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-250",
          !sidebarCollapsed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarCollapsed(true)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen bg-[#0a0a0f] border-r border-[#18181b] z-40 transition-all duration-300 ease-out",
          sidebarCollapsed ? "w-0 -translate-x-full" : "w-64 translate-x-0",
          "lg:translate-x-0 lg:block"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-[#18181b]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">U</span>
              </div>
              <div>
                <h1 className="text-white font-semibold text-sm">Uzum</h1>
                <p className="text-[#71717a] text-xs">Dashboard</p>
              </div>
            </div>
          </div>

          {/* Store Selector */}
          {activeStore && (
            <div className="px-3 py-3 border-b border-[#18181b]">
              <button className="w-full group flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#0f0f16] transition-all duration-150">
                <div className="w-10 h-10 rounded-lg bg-[#1c1c21] group-hover:bg-[#27272a] transition-colors flex items-center justify-center text-xs font-semibold text-[#8b5cf6]">
                  <Store className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-[#fafafa] group-hover:text-[#a78bfa] transition-colors">
                    {activeStore.name}
                  </p>
                  <p className="text-xs text-[#71717a] capitalize">{activeStore.plan || "Free"}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-[#71717a] group-hover:text-[#a1a1aa] transition-colors" />
              </button>
            </div>
          )}

          {/* Main Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
            {mainNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarCollapsed(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                    isActive
                      ? "bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] text-white shadow-lg"
                      : "text-[#a1a1aa] hover:bg-[#0f0f16] hover:text-[#fafafa]"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      isActive ? "text-[#a78bfa]" : "group-hover:text-[#8b5cf6]"
                    )}
                  />
                  <span>{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse-subtle" />
                  )}
                </Link>
              );
            })}

            {/* Section Divider */}
            <div className="pt-4 mt-4 border-t border-[#18181b]">
              <p className="px-3 pb-2 text-xs font-semibold text-[#71717a] uppercase tracking-wider">
                Boshqa
              </p>
              {secondaryNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarCollapsed(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                      isActive
                        ? "bg-[#0f0f16] text-white"
                        : "text-[#a1a1aa] hover:bg-[#0f0f16] hover:text-[#fafafa]"
                    )}
                  >
                    <item.icon className="w-5 h-5 group-hover:text-[#8b5cf6] transition-colors" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User Profile & Logout */}
          <div className="p-3 border-t border-[#18181b]">
            <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-[#0f0f16] transition-colors">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-sm font-semibold text-white shadow-lg">
                {user?.name?.slice(0, 2).toUpperCase() || user?.phone?.slice(-2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#fafafa] truncate">
                  {user?.name || "Foydalanuvchi"}
                </p>
                <p className="text-xs text-[#71717a] truncate">{user?.phone}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-[#ef4444]/10 transition-colors text-[#71717a] hover:text-[#ef4444]"
                title="Chiqish"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

interface HeaderProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, action }: HeaderProps) {
  const { sidebarCollapsed, setSidebarCollapsed } = useDashboardStore();

  return (
    <header className={cn(
      "fixed top-0 right-0 left-0 h-16 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-[#18181b] z-30 transition-all duration-300",
      !sidebarCollapsed && "lg:left-64",
      sidebarCollapsed && "lg:left-0"
    )}>
      <div className="h-full flex items-center justify-between px-4 lg:px-6">
        {/* Left: Menu + Search + Title */}
        <div className="flex items-center gap-4">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="lg:hidden p-2 rounded-lg hover:bg-[#0f0f16] transition-colors"
          >
            <Menu className="w-5 h-5 text-[#a1a1aa]" />
          </button>

          {/* Desktop menu toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:block p-2 rounded-lg hover:bg-[#0f0f16] transition-colors"
          >
            <Menu className="w-5 h-5 text-[#a1a1aa]" />
          </button>

          {/* Search */}
          <div className="hidden md:flex relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a] group-focus-within:text-[#8b5cf6] transition-colors" />
            <input
              type="text"
              placeholder="Qidirish..."
              className="w-56 xl:w-72 h-9 pl-10 pr-4 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all duration-200"
            />
          </div>

          {/* Page Title */}
          {title && (
            <div className="hidden md:block">
              <h2 className="text-lg font-semibold text-[#fafafa]">{title}</h2>
              {subtitle && <p className="text-xs text-[#71717a]">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Right: Notifications + Profile + Action */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button className="relative p-2 rounded-xl hover:bg-[#0f0f16] transition-colors group">
            <Bell className="w-5 h-5 text-[#a1a1aa] group-hover:text-[#fafafa] transition-colors" />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#ef4444] ring-2 ring-[#0a0a0f]" />
          </button>

          {/* Profile */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-sm font-semibold text-white cursor-pointer hover:ring-2 hover:ring-[#8b5cf6]/50 transition-all">
            {useAuthStore.getState().user?.name?.slice(0, 2).toUpperCase() || "U"}
          </div>

          {/* Custom Action Button */}
          {action && <div className="hidden lg:block">{action}</div>}
        </div>
      </div>
    </header>
  );
}