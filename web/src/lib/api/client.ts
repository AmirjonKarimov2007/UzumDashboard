import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const { accessToken, user } = useAuthStore.getState();
      (config as any)._authUserId = user?.id;
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
        return config;
      }
      const raw = localStorage.getItem('auth-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        const token = parsed?.state?.accessToken;
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

// Avoid concurrent refresh attempts — share a single promise across simultaneous 401s
let refreshInFlight: { token: string; promise: Promise<string> } | null = null;

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return /\/auth\/(send-otp|verify-otp|refresh|logout)/.test(url);
}

function isOnLoginPage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/login');
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any;
    const status = error.response?.status;

    // Only intercept 401s; ignore for auth endpoints themselves (avoid loops)
    if (status !== 401 || !original || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;

    const store = useAuthStore.getState();
    // Never replay a request under a different account after logout/impersonation.
    if (original._authUserId && original._authUserId !== store.user?.id) {
      return Promise.reject(error);
    }
    if (store.accessToken && original.headers?.Authorization !== `Bearer ${store.accessToken}`) {
      original.headers.Authorization = `Bearer ${store.accessToken}`;
      return apiClient(original);
    }
    const refreshToken = store.refreshToken
      || (() => {
        try { return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.refreshToken; }
        catch { return null; }
      })();

    // No refresh token → silently fail, do NOT force-logout unless we were authenticated
    if (!refreshToken) {
      if (store.adminSession && !isOnLoginPage()) {
        store.stopImpersonation();
        window.location.href = '/super-admin';
        return Promise.reject(error);
      }
      if (store.isAuthenticated && !store.adminSession) {
        store.logout();
        if (!isOnLoginPage()) window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    try {
      if (!refreshInFlight || refreshInFlight.token !== refreshToken) {
        const promise = axios
          .post(`${API_URL}/auth/refresh`, { refreshToken }, { timeout: 30_000 })
          .then((res) => {
            const newAccess = res.data.accessToken;
            const newRefresh = res.data.refreshToken || refreshToken;
            if (typeof newAccess !== 'string' || !newAccess.trim()
              || typeof newRefresh !== 'string' || !newRefresh.trim()) {
              throw new Error('Sessiyani yangilash javobi noto‘g‘ri');
            }
            const current = useAuthStore.getState();
            if (current.refreshToken !== refreshToken || current.user?.id !== store.user?.id) {
              throw new Error('Sessiya o‘zgargan; eski so‘rov bekor qilindi');
            }
            useAuthStore.getState().setTokens(newAccess, newRefresh);
            return newAccess;
          })
          .finally(() => {
            if (refreshInFlight?.promise === promise) refreshInFlight = null;
          });
        refreshInFlight = { token: refreshToken, promise };
      }

      const newAccess = await refreshInFlight.promise;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshError) {
      // Offline, timeout, rate-limit and server failures do not revoke a session.
      // Also ignore a late failure from an account the user has already left.
      const current = useAuthStore.getState();
      const rejected = axios.isAxiosError(refreshError)
        && [401, 403].includes(refreshError.response?.status || 0);
      if (rejected && current.refreshToken === refreshToken && current.user?.id === store.user?.id) {
        current.logout();
        if (typeof window !== 'undefined' && !isOnLoginPage()) {
          window.location.href = current.adminSession ? '/super-admin' : '/login';
        }
      }
      return Promise.reject(refreshError);
    }
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'Unknown error';
  }
  return String(error);
}
