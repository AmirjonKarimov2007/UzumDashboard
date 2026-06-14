import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";
export type Currency = "UZS" | "USD";

interface DashboardState {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  commandPaletteOpen: boolean;
  theme: Theme;
  timeRange: string;
  // Currency: usdRate = how many UZS for 1 USD; displayCurrency = how money is shown
  usdRate: number;
  displayCurrency: Currency;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMobileOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTimeRange: (range: string) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setUsdRate: (rate: number) => void;
  setDisplayCurrency: (c: Currency) => void;
  toggleDisplayCurrency: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      commandPaletteOpen: false,
      theme: "dark",
      timeRange: "month",
      usdRate: 12900,
      displayCurrency: "UZS",
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setTimeRange: (range) => set({ timeRange: range }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
      setUsdRate: (rate) => set({ usdRate: rate > 0 ? rate : 0 }),
      setDisplayCurrency: (c) => set({ displayCurrency: c }),
      toggleDisplayCurrency: () =>
        set((state) => ({ displayCurrency: state.displayCurrency === "UZS" ? "USD" : "UZS" })),
    }),
    {
      name: "dashboard-prefs",
      partialize: (state) => ({
        theme: state.theme,
        timeRange: state.timeRange,
        usdRate: state.usdRate,
        displayCurrency: state.displayCurrency,
      }),
    },
  ),
);
