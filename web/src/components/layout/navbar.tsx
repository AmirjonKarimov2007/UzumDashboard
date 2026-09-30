"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  X,
  CheckCheck,
  Command,
  Sun,
  Moon,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useAuthStore } from "@/stores/auth-store";
import { useMe, useUpdateUsdRate } from "@/hooks/use-users";

const pageLabels: Record<string, { title: string; subtitle: string }> = {
  "/super-admin": { title: "Super-admin", subtitle: "Foydalanuvchilar va do‘konlar" },
  "/dashboard": { title: "Bosh sahifa", subtitle: "Savdo ko'rsatkichlari" },
  "/analytics": { title: "Analitika", subtitle: "Chuqur tahlil va statistika" },
  "/products": { title: "Mahsulotlar", subtitle: "Katalog boshqaruvi" },
  "/orders": { title: "Buyurtmalar", subtitle: "Buyurtmalar kuzatuvi" },
  "/finance": { title: "Moliya", subtitle: "Daromad va xarajatlar" },
  "/inventory": { title: "Inventar", subtitle: "Ombor holati" },
  "/notifications": { title: "Bildirishnomalar", subtitle: "Ogohlantirish va yangiliklar" },
  "/supplies": { title: "Ta’minlashlar", subtitle: "FBS ta’minlashlar va Smartup importi" },
  "/team": { title: "Jamoa", subtitle: "Foydalanuvchilar boshqaruvi" },
  "/reports": { title: "Hisobotlar", subtitle: "Eksport va tahlil" },
  "/settings": { title: "Sozlamalar", subtitle: "Profil va tizim sozlamalari" },
};

export function Navbar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, setCommandPaletteOpen, theme, toggleTheme,
    usdRate, displayCurrency, setUsdRate, setDisplayCurrency } = useDashboardStore();
  const [rateInput, setRateInput] = useState<string>("");
  const { user } = useAuthStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // The server (User.usdRate) is the source of truth — hydrate the local store
  // from it once on load, then persist back whenever the user edits the rate.
  const { data: me } = useMe();
  const updateUsdRate = useUpdateUsdRate();
  const hydratedRate = useRef(false);
  useEffect(() => {
    if (hydratedRate.current) return;
    if (typeof me?.usdRate === "number" && me.usdRate > 0) {
      setUsdRate(me.usdRate);
      hydratedRate.current = true;
    }
  }, [me?.usdRate, setUsdRate]);

  const saveUsdRate = () => {
    setRateInput("");
    if (usdRate > 0 && usdRate !== me?.usdRate) {
      updateUsdRate.mutate(usdRate);
    }
  };

  const page = Object.entries(pageLabels).find(([key]) => pathname.startsWith(key))?.[1] ?? {
    title: "Dashboard",
    subtitle: "",
  };

  // Haqiqiy bildirishnoma tizimi ulanmaguncha soxta sonlar ko'rsatilmaydi
  const unreadCount = 0;

  return (
    <header
      className={cn(
        "dashboard-topbar fixed right-0 top-0 z-20 h-[72px] transition-[left] duration-200 ease-out",
        sidebarCollapsed ? "left-0" : "left-[272px]"
      )}
    >
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5 lg:px-7">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="icon-button -ml-1 lg:hidden"
            aria-label="Menyuni ochish"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="icon-button -ml-1 hidden lg:flex"
            aria-label={sidebarCollapsed ? "Yon panelni ochish" : "Yon panelni yopish"}
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Page title */}
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-none text-[var(--text-primary)] sm:text-[15px]">{page.title}</h1>
            <p className="mt-1 hidden truncate text-[11px] text-[var(--text-muted)] sm:block">{page.subtitle}</p>
          </div>
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Search / Command palette trigger */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="topbar-search hidden h-9 items-center gap-2 px-3 text-xs md:flex"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Qidirish...</span>
            <div className="flex items-center gap-0.5 ml-2">
              <kbd className="flex h-5 items-center rounded bg-[#27272a] px-1.5 text-[10px] font-medium text-[#71717a]">
                <Command className="w-2.5 h-2.5 mr-0.5" />K
              </kbd>
            </div>
          </button>

          {/* Mobile search */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="icon-button md:hidden"
            aria-label="Qidiruvni ochish"
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          {/* USD rate (editable): 1$ = N so'm */}
          <div className="topbar-control hidden h-9 items-center gap-1.5 px-2.5 lg:flex">
            <DollarSign className="w-3.5 h-3.5 text-[#10b981]" />
            <span className="text-[11px] text-[#52525b]">1$ =</span>
            <input
              inputMode="numeric"
              value={(rateInput !== "" ? rateInput : String(usdRate || "")).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setRateInput(digits);
                setUsdRate(digits ? Number(digits) : 0);
              }}
              onBlur={saveUsdRate}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="0"
              className="w-[58px] bg-transparent text-right text-xs text-white focus:outline-none tabular-nums placeholder:text-[#3f3f46]"
            />
            <span className="text-[11px] text-[#52525b]">so'm</span>
          </div>

          {/* Display currency toggle: UZS / USD */}
          <div className="topbar-control hidden items-center p-0.5 sm:flex">
            {(["UZS", "USD"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setDisplayCurrency(c)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-semibold transition-all",
                  displayCurrency === c
                    ? "bg-[#8b5cf6] text-white shadow-sm"
                    : "text-[#71717a] hover:text-white"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
            title={theme === "dark" ? "Yorug' rejim" : "Qorong'i rejim"}
            className="icon-button relative"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === "dark" ? (
                <motion.span
                  key="moon"
                  initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                  transition={{ duration: 0.18 }}
                  className="block"
                >
                  <Moon className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="sun"
                  initial={{ opacity: 0, rotate: 90, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: -90, scale: 0.7 }}
                  transition={{ duration: 0.18 }}
                  className="block"
                >
                  <Sun className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              className={cn(
                "relative p-2 rounded-lg transition-colors",
                "icon-button",
                notifOpen && "is-active"
              )}
              aria-label="Bildirishnomalar"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ef4444] ring-2 ring-[#0a0a0f]" />
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="floating-panel absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#18181b]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Bildirishnomalar</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#ef4444]/15 text-[#ef4444] rounded-full">
                          {unreadCount} yangi
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-md hover:bg-[#18181b] text-[#52525b] hover:text-[#a1a1aa] transition-colors">
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setNotifOpen(false)}
                        className="p-1.5 rounded-md hover:bg-[#18181b] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
                    <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
                      <div className="w-10 h-10 rounded-xl bg-[#18181b] flex items-center justify-center">
                        <Bell className="w-4.5 h-4.5 text-[#3f3f46]" />
                      </div>
                      <p className="text-xs text-[#71717a]">Hozircha bildirishnoma yo'q</p>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 border-t border-[#18181b]">
                    <a href="/notifications" className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors font-medium">
                      Barchasini ko'rish →
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="profile-trigger group flex items-center gap-2 py-1 pl-1 pr-1.5"
              aria-label="Profil menyusi"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center text-xs font-semibold text-white">
                {user?.name?.slice(0, 2).toUpperCase() || "U"}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#52525b] group-hover:text-[#a1a1aa] transition-colors" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="floating-panel absolute right-0 top-12 z-50 w-56 overflow-hidden py-1"
                >
                  <div className="px-4 py-3 border-b border-[#18181b]">
                    <p className="text-sm font-medium text-white">{user?.name || "Foydalanuvchi"}</p>
                    <p className="text-xs text-[#52525b]">{user?.phone}</p>
                  </div>
                  {[
                    { label: "Profil", href: "/settings" },
                    { label: "Sozlamalar", href: "/settings" },
                    { label: "Jamoa", href: "/team" },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/60 transition-colors"
                    >
                      {item.label}
                    </a>
                  ))}
                  <div className="border-t border-[#18181b] mt-1 pt-1">
                    <button
                      onClick={() => { useAuthStore.getState().logout(); setProfileOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#ef4444] hover:bg-[#ef4444]/8 transition-colors"
                    >
                      Chiqish
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Click-away for dropdowns */}
      {(notifOpen || profileOpen) && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => { setNotifOpen(false); setProfileOpen(false); }}
        />
      )}
    </header>
  );
}
