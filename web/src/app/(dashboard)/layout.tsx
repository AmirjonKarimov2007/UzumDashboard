"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useDashboardStore } from "@/stores/dashboard-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const adminSession = useAuthStore((s) => s.adminSession);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const currentUser = useAuthStore((s) => s.user);
  const { sidebarCollapsed, setSidebarCollapsed } = useDashboardStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push("/login");
  }, [isAuthenticated, _hasHydrated, router]);

  // Auto-collapse on mobile
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) setSidebarCollapsed(true);
      else setSidebarCollapsed(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setSidebarCollapsed]);

  if (!_hasHydrated || !isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl gradient-primary animate-pulse" />
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#52525b] animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell flex h-[var(--app-height,100dvh)] min-h-0 overflow-hidden">
      <Sidebar />
      <CommandPalette />

      {/* Main content area */}
      <div
        className={cn(
          "dashboard-workspace flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out",
          !sidebarCollapsed && "lg:ml-[272px]"
        )}
      >
        <Navbar />
        <main className="dashboard-main flex-1 overflow-y-auto overscroll-contain scrollbar-thin pt-[72px]">
          {adminSession && (
            <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-[#f59e0b]/30 bg-[#2a1d08] px-4 py-2.5 text-xs text-[#fde68a] shadow-lg shadow-black/20">
              <p>
                Kuzatuv rejimi: <strong className="text-white">{currentUser?.name || currentUser?.phone}</strong> dashboardi
              </p>
              <button
                type="button"
                onClick={() => { stopImpersonation(); queryClient.clear(); router.push('/super-admin'); }}
                className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-1.5 font-medium text-[#fbbf24] hover:bg-[#f59e0b]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fbbf24]"
              >
                Admin panelga qaytish
              </button>
            </div>
          )}
          <div className="dashboard-content mx-auto w-full max-w-[1720px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-5 sm:pt-5 lg:px-8 lg:pb-10 lg:pt-7 xl:px-10">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
