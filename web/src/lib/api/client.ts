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
      const { accessToken } = useAuthStore.getState();
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
let refreshPromise: Promise<string> | null = null;

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
    const refreshToken = store.refreshToken
      || (() => {
        try { return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.refreshToken; }
        catch { return null; }
      })();

    // No refresh token → silently fail, do NOT force-logout unless we were authenticated
    if (!refreshToken) {
      if (store.isAuthenticated && !isOnLoginPage()) {
        store.logout();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${API_URL}/auth/refresh`, { refreshToken })
          .then((res) => {
            const newAccess = res.data.accessToken;
            const newRefresh = res.data.refreshToken || refreshToken;
            useAuthStore.getState().setTokens(newAccess, newRefresh);
            return newAccess;
          })
          .finally(() => {
            // Clear after the current microtask so simultaneous awaiters can read it
            setTimeout(() => { refreshPromise = null; }, 0);
          });
      }

      const newAccess = await refreshPromise;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshError) {
      // Refresh truly failed — clear state and redirect (only if not already on login)
      console.warn('Token refresh failed — logging out');
      useAuthStore.getState().logout();
      try { localStorage.removeItem('auth-storage'); } catch {}
      if (typeof window !== 'undefined' && !isOnLoginPage()) {
        window.location.href = '/login';
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
