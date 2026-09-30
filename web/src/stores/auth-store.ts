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

interface AdminSession {
  user: User;
  activeStoreId: string | null;
  accessToken: string;
  refreshToken: string | null;
}

interface AuthState {
  user: User | null;
  activeStoreId: string | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  adminSession: AdminSession | null;
  _hasHydrated: boolean;

  setUser: (user: User | null) => void;
  setActiveStoreId: (id: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  startImpersonation: (user: User, accessToken: string) => void;
  stopImpersonation: () => void;
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
      adminSession: null,
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

      startImpersonation: (user, accessToken) =>
        set((state) => ({
          adminSession: state.adminSession || (state.user && state.accessToken ? {
            user: state.user,
            activeStoreId: state.activeStoreId,
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
          } : null),
          user,
          activeStoreId: user.stores[0]?.id ?? null,
          isAuthenticated: true,
          accessToken,
          refreshToken: null,
        })),

      stopImpersonation: () =>
        set((state) => state.adminSession ? ({
          user: state.adminSession.user,
          activeStoreId: state.adminSession.activeStoreId,
          isAuthenticated: true,
          accessToken: state.adminSession.accessToken,
          refreshToken: state.adminSession.refreshToken,
          adminSession: null,
        }) : state),

      logout: () =>
        set((state) => state.adminSession ? ({
          user: state.adminSession.user,
          activeStoreId: state.adminSession.activeStoreId,
          isAuthenticated: true,
          accessToken: state.adminSession.accessToken,
          refreshToken: state.adminSession.refreshToken,
          adminSession: null,
        }) : ({
          user: null,
          isAuthenticated: false,
          activeStoreId: null,
          accessToken: null,
          refreshToken: null,
          adminSession: null,
        })),

      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: "auth-storage",
      storage: typeof window !== 'undefined' ? {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch { return null; }
        },
        setItem: (name, value) => {
          try { localStorage.setItem(name, JSON.stringify(value)); } catch {}
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name); } catch {}
        },
      } : undefined,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
