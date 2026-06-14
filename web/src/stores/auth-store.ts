import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Store {
  id: string;
  name: string;
  domain?: string;
  plan?: string;
}

interface User {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  avatar?: string;
  stores: Store[];
}

interface AuthState {
  user: User | null;
  activeStoreId: string | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  _hasHydrated: boolean;

  setUser: (user: User | null) => void;
  setActiveStoreId: (id: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      activeStoreId: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      _hasHydrated: false,

      setUser: (user) =>
        set((state) => {
          // Preserve activeStoreId if already set AND it still exists in the new user's stores
          const stillValid =
            state.activeStoreId &&
            user?.stores.some((s) => s.id === state.activeStoreId);
          return {
            user,
            isAuthenticated: !!user,
            activeStoreId: stillValid
              ? state.activeStoreId
              : user?.stores[0]?.id ?? null,
          };
        }),

      setActiveStoreId: (id) => set({ activeStoreId: id }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          activeStoreId: null,
          accessToken: null,
          refreshToken: null,
        }),

      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: "auth-storage",
      storage: typeof window !== 'undefined' ? {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      } : undefined,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
