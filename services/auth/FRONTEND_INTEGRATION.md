# Frontend Integration Guide

How to integrate the Uzum Auth Service with the Next.js frontend.

## API Client Setup

### 1. Create API Base Configuration
```typescript
// lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = {
  async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  },

  async get<T>(endpoint: string, token?: string): Promise<T> {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
};
```

### 2. Auth Service
```typescript
// services/auth.ts
import { api } from '@/lib/api';

export interface SendOtpResponse {
  message: string;
  expiresAt: Date;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  sendOtp: (phone: string) =>
    api.post<SendOtpResponse>('/auth/send-otp', { phone }),

  verifyOtp: (phone: string, code: string) =>
    api.post<LoginResponse>('/auth/verify-otp', {
      phone,
      code,
      device: {
        type: 'web',
        browser: navigator.userAgent,
      },
    }),

  refreshToken: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      refreshToken,
    }),

  logout: (refreshToken: string, userId: string) =>
    api.post('/auth/logout', { refreshToken, userId }),
};
```

### 3. Update Auth Store
```typescript
// stores/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService } from '@/services/auth';

interface User {
  id: string;
  phone: string;
  name?: string;
  avatar?: string;
  stores: Store[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  // Actions
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  refreshTokens: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      sendOtp: async (phone) => {
        await authService.sendOtp(phone);
      },

      verifyOtp: async (phone, code) => {
        const response = await authService.verifyOtp(phone, code);
        set({
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          isAuthenticated: true,
        });
      },

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error('No refresh token');

        const response = await authService.refreshToken(refreshToken);
        set({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });
      },

      logout: async () => {
        const { refreshToken, user } = get();
        if (refreshToken && user) {
          await authService.logout(refreshToken, user.id);
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

### 4. Update Login Page
```typescript
// app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const { sendOtp, verifyOtp, isAuthenticated } = useAuthStore();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await sendOtp(phone);
      setStep("code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await verifyOtp(phone, code);
      if (isAuthenticated) {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0a0a0f] border border-[#27272a]">
        {/* ... existing UI ... */}

        {error && (
          <div className="p-3 rounded-lg bg-[#ef4444]/10 text-[#ef4444] text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 5. API Client with Token Refresh
```typescript
// lib/api-client.ts
import { useAuthStore } from "@/stores/auth-store";

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { accessToken, refreshToken, refreshTokens, logout } = useAuthStore.getState();

  let token = accessToken;

  // Try to refresh if no token
  if (!token && refreshToken) {
    try {
      await refreshTokens();
      token = useAuthStore.getState().accessToken;
    } catch {
      await logout();
      window.location.href = "/login";
      throw new Error("Session expired");
    }
  }

  // Make initial request
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // If 401, try refresh and retry
  if (response.status === 401 && refreshToken) {
    try {
      await refreshTokens();
      token = useAuthStore.getState().accessToken;

      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      await logout();
      window.location.href = "/login";
      throw new Error("Session expired");
    }
  }

  return response;
}
```

## Environment Variables

Add to `.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Testing the Integration

### 1. Start Auth Service
```bash
cd services/auth
npm install
npm run start:dev
```

### 2. Start Frontend
```bash
cd web
npm run dev
```

### 3. Test Login Flow
1. Navigate to http://localhost:3000
2. Enter phone number: `+998901234567`
3. Check auth service console for OTP code
4. Enter OTP code
5. Should redirect to dashboard

## Security Notes

1. **HTTPS in Production**: Always use HTTPS for API calls
2. **Token Storage**: Tokens are in localStorage (add HttpOnly cookies for production)
3. **CSRF Protection**: Add CSRF tokens for production
4. **Rate Limiting**: Backend has built-in rate limiting

## Troubleshooting

### "No refresh token"
- Clear localStorage and re-login
- Check if token expired

### "Session expired"
- Automatic refresh happens on next request
- If refresh fails, user is logged out

### CORS Errors
- Check `CORS_ORIGINS` in backend `.env`
- Ensure frontend URL is listed