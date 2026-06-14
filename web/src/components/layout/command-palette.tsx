"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  X,
  Search,
  ArrowRight,
  Hash,
  Zap,
} from "lucide-react";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  shortcut?: string[];
}

const commands: CommandItem[] = [
  // Pages
  { id: "dashboard", label: "Bosh sahifa", description: "Asosiy dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Sahifalar" },
  { id: "analytics", label: "Analitika", description: "Sotuv tahlili", href: "/analytics", icon: BarChart3, group: "Sahifalar" },
  { id: "products", label: "Mahsulotlar", description: "Mahsulotlar katalogi", href: "/products", icon: Package, group: "Sahifalar" },
  { id: "orders", label: "Buyurtmalar", description: "Buyurtmalar ro'yxati", href: "/orders", icon: ShoppingCart, group: "Sahifalar" },
  { id: "finance", label: "Moliya", description: "Daromad va xarajatlar", href: "/finance", icon: Wallet, group: "Sahifalar" },
  { id: "inventory", label: "Inventar", description: "Ombor holati", href: "/inventory", icon: Boxes, group: "Sahifalar" },
  { id: "notifications", label: "Bildirishnomalar", description: "Ogohlantirish va xabarlar", href: "/notifications", icon: Bell, group: "Sahifalar" },
  { id: "ai", label: "AI Tahlil", description: "Aqlli tavsiyalar va bashorat", href: "/ai", icon: Sparkles, group: "Sahifalar" },
  { id: "team", label: "Jamoa", description: "Foydalanuvchi boshqaruvi", href: "/team", icon: Users, group: "Sahifalar" },
  { id: "reports", label: "Hisobotlar", description: "Eksport va hisobotlar", href: "/reports", icon: FileText, group: "Sahifalar" },
  { id: "settings", label: "Sozlamalar", description: "Profil va tizim sozlamalari", href: "/settings", icon: Settings, group: "Sahifalar" },
  // Quick actions
  { id: "new-product", label: "Yangi mahsulot qo'shish", description: "Mahsulot katalogiga qo'shish", href: "/products", icon: Package, group: "Tezkor amallar", shortcut: ["N", "P"] },
  { id: "view-orders", label: "Kutilayotgan buyurtmalar", description: "Pending statusdagi buyurtmalar", href: "/orders", icon: ShoppingCart, group: "Tezkor amallar" },
  { id: "finance-report", label: "Moliyaviy hisobot", description: "Joriy oy hisoboti", href: "/reports", icon: FileText, group: "Tezkor amallar" },
  { id: "ai-insights", label: "AI tavsiyalarni ko'rish", description: "Aqlli tahlil va takliflar", href: "/ai", icon: Sparkles, group: "Tezkor amallar", shortcut: ["A", "I"] },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useDashboardStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  const flatFiltered = Object.values(grouped).flat();

  const close = useCallback(() => {
    setCommandPaletteOpen(false);
    setQuery("");
    setSelectedIdx(0);
  }, [setCommandPaletteOpen]);

  const run = useCallback(
    (cmd: CommandItem) => {
      if (cmd.href) router.push(cmd.href);
      close();
    },
    [router, close]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [commandPaletteOpen, setCommandPaletteOpen, close]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        const cmd = flatFiltered[selectedIdx];
        if (cmd) run(cmd);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [commandPaletteOpen, flatFiltered, selectedIdx, run]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md"
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.18, type: "spring", stiffness: 600, damping: 40 }}
            className="fixed top-[12%] left-1/2 -translate-x-1/2 z-[81] w-full max-w-[560px] mx-4"
          >
            <div className="rounded-2xl bg-[#0f0f16] border border-[#27272a] shadow-elevated overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#18181b]">
                <Search className="w-4 h-4 text-[#52525b] flex-shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Qidirish yoki buyruq kiriting..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-[#52525b] outline-none"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-[#52525b] hover:text-[#a1a1aa]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="hidden sm:flex h-6 items-center px-2 rounded-md bg-[#18181b] border border-[#27272a] text-[10px] text-[#52525b]">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[380px] overflow-y-auto scrollbar-thin py-2">
                {Object.keys(grouped).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Hash className="w-8 h-8 text-[#27272a] mb-3" />
                    <p className="text-sm text-[#52525b]">Hech narsa topilmadi</p>
                    <p className="text-xs text-[#3f3f46] mt-1">Boshqa so'z bilan qidiring</p>
                  </div>
                ) : (
                  Object.entries(grouped).map(([group, items]) => {
                    let flatIdx = 0;
                    for (const [g, gItems] of Object.entries(grouped)) {
                      if (g === group) break;
                      flatIdx += gItems.length;
                    }
                    return (
                      <div key={group}>
                        <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3f3f46]">
                          {group}
                        </p>
                        {items.map((cmd, i) => {
                          const itemIdx = flatIdx + i;
                          const isSelected = selectedIdx === itemIdx;
                          return (
                            <button
                              key={cmd.id}
                              onClick={() => run(cmd)}
                              onMouseEnter={() => setSelectedIdx(itemIdx)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                isSelected
                                  ? "bg-[#8b5cf6]/12 text-white"
                                  : "text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/60"
                              )}
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                                isSelected ? "bg-[#8b5cf6]/20 text-[#a78bfa]" : "bg-[#18181b] text-[#52525b]"
                              )}>
                                <cmd.icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{cmd.label}</p>
                                {cmd.description && (
                                  <p className="text-[11px] text-[#52525b] truncate">{cmd.description}</p>
                                )}
                              </div>
                              {cmd.shortcut && (
                                <div className="flex items-center gap-1">
                                  {cmd.shortcut.map((k) => (
                                    <kbd key={k} className="h-5 px-1.5 rounded bg-[#18181b] border border-[#27272a] text-[10px] text-[#52525b]">
                                      {k}
                                    </kbd>
                                  ))}
                                </div>
                              )}
                              {isSelected && <ArrowRight className="w-4 h-4 text-[#8b5cf6] flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#18181b] text-[10px] text-[#3f3f46]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-[#18181b] border border-[#27272a]">↑↓</kbd> navigatsiya</span>
                  <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-[#18181b] border border-[#27272a]">↵</kbd> ochish</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-[#8b5cf6]" />
                  <span>Uzum Dashboard</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
