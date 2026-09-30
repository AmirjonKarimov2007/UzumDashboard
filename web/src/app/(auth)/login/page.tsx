"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock3, KeyRound, Loader2,
  LockKeyhole, MessageCircleMore, RefreshCw, Send, ShieldCheck, Smartphone,
} from "lucide-react";
import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function apiMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] || fallback : message || fallback;
}

function formatPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits.startsWith("998")) digits = digits.length <= 9 ? `998${digits}` : digits;
  digits = digits.slice(0, 12);
  const local = digits.slice(3);
  return `+998${local ? ` ${local.slice(0, 2)}` : ""}${local.length > 2 ? ` ${local.slice(2, 5)}` : ""}${local.length > 5 ? ` ${local.slice(5, 7)}` : ""}${local.length > 7 ? ` ${local.slice(7, 9)}` : ""}`;
}

async function getTelegramInitData(timeoutMs = 3000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const telegram = (window as any).Telegram?.WebApp;
    if (telegram && typeof telegram.initData === "string") {
      return telegram.initData && telegram.platform !== "unknown" ? telegram.initData : null;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);
  const logout = useAuthStore((state) => state.logout);
  const stopImpersonation = useAuthStore((state) => state.stopImpersonation);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const adminSession = useAuthStore((state) => state.adminSession);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const codeInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("+998 ");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [checkingStoredSession, setCheckingStoredSession] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);

  // Telegram WebApp avto-login holati. Telegram ichida ochilgan bo'lsa, darhol
  // "checking" bilan boshlaymiz — telefon formasi bir lahza ko'rinib ketmasligi uchun.
  const [tgPhase, setTgPhase] = useState<"idle" | "checking" | "not-linked">(() => {
    if (typeof window !== "undefined") {
      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.initData && tg.platform !== "unknown") return "checking";
    }
    return "idle";
  });
  const tgInitData = useRef<string | null>(null);
  const tgTried = useRef(false);
  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = `+${digits}`;
  const phoneIsValid = /^998\d{9}$/.test(digits);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      setCheckingStoredSession(false);
      return;
    }
    if (!accessToken && !refreshToken) {
      logout();
      setCheckingStoredSession(false);
      return;
    }

    let cancelled = false;
    setCheckingStoredSession(true);
    setSessionRestoreError("");
    const restoreSession = async () => {
      try {
        // apiClient automatically rotates an expired access token with the
        // long-lived refresh token, then retries this validation request.
        await apiClient.post('/auth/validate');
        if (!cancelled) router.replace('/dashboard');
      } catch (restoreError) {
        if (cancelled) return;
        const rejected = axios.isAxiosError(restoreError)
          && [401, 403].includes(restoreError.response?.status || 0);
        if (adminSession && rejected) {
          // An expired impersonation token must not discard the administrator's
          // original session. Restore it and let this effect validate it again.
          stopImpersonation();
          return;
        }
        if (rejected) logout();
        else setSessionRestoreError("Sessiyani tekshirib bo‘lmadi. Internet yoki server bilan ulanishni tekshiring. Saqlangan sessiyangiz o‘chirilmadi.");
        setCheckingStoredSession(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, [accessToken, adminSession, hasHydrated, isAuthenticated, logout, refreshToken, router, stopImpersonation, sessionRetry]);

  useEffect(() => {
    if (!resendTimer) return;
    const timer = window.setInterval(() => setResendTimer((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  const applyLogin = useCallback((data: any) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser({
      id: data.user.id,
      phone: data.user.phone,
      email: data.user.email ?? undefined,
      name: data.user.name ?? undefined,
      avatar: data.user.avatar ?? undefined,
      stores: (data.user.stores ?? []).map((store: any) => ({
        id: store.id, name: store.name, domain: store.domain ?? undefined, plan: store.plan ?? undefined,
      })),
    });
    router.replace("/dashboard");
  }, [router, setTokens, setUser]);

  const tryTelegramLogin = useCallback(async (initData: string): Promise<"ok" | "not-linked" | "error"> => {
    try {
      const { data } = await axios.post(`${API_URL}/auth/telegram`, { initData });
      applyLogin(data);
      return "ok";
    } catch (requestError) {
      if (!axios.isAxiosError(requestError)) return "error";
      const message = requestError.response?.data?.message;
      return requestError.response?.status === 404 || message === "telegram_not_linked" ? "not-linked" : "error";
    }
  }, [applyLogin]);

  useEffect(() => {
    if (tgTried.current) return;
    tgTried.current = true;
    void (async () => {
      const initData = await getTelegramInitData();
      if (!initData) return;
      tgInitData.current = initData;
      setTgPhase("checking");
      const result = await tryTelegramLogin(initData);
      if (result !== "ok") setTgPhase("not-linked");
    })();
  }, [tryTelegramLogin]);

  const shareContactAndRetry = useCallback(() => {
    const telegram = (window as any).Telegram?.WebApp;
    if (!telegram?.requestContact) {
      setError("Telegram versiyangiz kontakt ulashni qo‘llab-quvvatlamaydi. Botga /start yuborib telefon raqamingizni ulang.");
      return;
    }
    setLoading(true);
    telegram.requestContact(async (response: unknown) => {
      const result = response as { status?: string } | boolean;
      const granted = result === true || (typeof result === "object" && ["sent", "allowed"].includes(result?.status || ""));
      if (!granted) {
        setLoading(false);
        return;
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        if (await tryTelegramLogin(tgInitData.current || "") === "ok") return;
      }
      setLoading(false);
      setError("Telefon ulandi, lekin kirish hali tayyor emas. Yana bir marta urinib ko‘ring.");
    });
  }, [tryTelegramLogin]);

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!phoneIsValid) return setError("Telefon raqamni +998 formatida to‘liq kiriting");
    setLoading(true); setError(""); setNotice(""); setDevCode(null);
    try {
      const { data } = await axios.post(`${API_URL}/auth/send-otp`, { phone: normalizedPhone });
      const localCode = data?.devMode && /^\d{6}$/.test(String(data?.devCode || ""))
        ? String(data.devCode)
        : null;
      setStep("code"); setCode(localCode || ""); setDevCode(localCode);
      setResendTimer(Number(data?.resendAfterSeconds) || 60);
      setNotice(data?.message || "Kirish kodi Telegramga yuborildi");
    } catch (requestError) {
      setError(apiMessage(requestError, "Telegramga kod yuborib bo‘lmadi"));
    } finally { setLoading(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("6 xonali kirish kodini to‘liq kiriting");
    setLoading(true); setError("");
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone: normalizedPhone, code, device: { type: "web", browser: navigator.userAgent },
      });
      applyLogin(data);
    } catch (requestError) {
      setCode("");
      setError(apiMessage(requestError, "Kod noto‘g‘ri yoki muddati tugagan"));
      window.setTimeout(() => codeInput.current?.focus(), 0);
    } finally { setLoading(false); }
  };

  const changePhone = () => {
    setStep("phone"); setCode(""); setError(""); setNotice(""); setDevCode(null);
  };

  if (tgPhase === "checking") {
    return (
      <main className="login-shell flex min-h-[var(--app-height,100dvh)] items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-[#27272a] bg-[#0f0f16] px-5 py-4 text-sm text-[#a1a1aa] shadow-2xl shadow-black/40">
          <Send className="h-5 w-5 text-[#38bdf8]" />
          <Loader2 className="h-4 w-4 animate-spin text-[#38bdf8]" />
          Telegram orqali kirish tekshirilmoqda…
        </div>
      </main>
    );
  }

  if (!hasHydrated || checkingStoredSession) {
    return (
      <main className="login-shell flex min-h-[var(--app-height,100dvh)] items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-[#27272a] bg-[#0f0f16] px-5 py-4 text-sm text-[#a1a1aa] shadow-2xl shadow-black/40">
          <Loader2 className="h-5 w-5 animate-spin text-[#38bdf8]" />
          Sessiya tekshirilmoqda…
        </div>
      </main>
    );
  }

  if (isAuthenticated && sessionRestoreError) {
    return (
      <main className="login-shell flex min-h-[var(--app-height,100dvh)] items-center justify-center bg-[var(--bg-base)] px-4 text-[var(--text-primary)]">
        <div role="alert" className="max-w-md rounded-2xl border border-[#27272a] bg-[#0f0f16] p-6 text-center">
          <p className="text-sm leading-6 text-[#a1a1aa]">{sessionRestoreError}</p>
          <button type="button" onClick={() => setSessionRetry((value) => value + 1)} className="mt-4 rounded-xl bg-[#0ea5e9] px-4 py-2 text-sm font-medium">Qayta tekshirish</button>
        </div>
      </main>
    );
  }

  return (
    <main className="login-shell relative min-h-[var(--app-height,100dvh)] overflow-hidden bg-[var(--bg-base)] px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))] text-[var(--text-primary)] sm:px-6 sm:py-8 lg:flex lg:items-center lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-18rem] h-[34rem] w-[34rem] rounded-full bg-[#6d5dfb]/12 blur-3xl" />
        <div className="absolute -bottom-72 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-[#0ea5e9]/8 blur-3xl" />
        <div className="login-grid absolute inset-0" />
      </div>

      <div className="login-card relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-[24px] lg:grid-cols-[.88fr_1.12fr]">
        <section className="login-intro relative border-b border-[var(--border-subtle)] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38bdf8] to-transparent" />
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#38bdf8]/25 bg-[#0ea5e9]/10 text-[#38bdf8]"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-sm font-semibold tracking-wide">Uzum Dashboard</p><p className="mt-0.5 text-xs text-[#71717a]">Telegram bilan tasdiqlangan kirish</p></div>
          </div>

          <div className="mt-12 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[.24em] text-[#38bdf8]">Parolsiz. Xavfsiz. Tez.</p>
            <h1 className="mt-4 text-3xl font-semibold leading-[1.12] tracking-[-.03em] sm:text-4xl">Telefon raqamingiz — akkauntingiz kaliti.</h1>
            <p className="mt-5 text-sm leading-6 text-[#a1a1aa]">Productionda kod akkauntga avvaldan bog‘langan Telegram chatiga yuboriladi. Lokal development rejimida test kodi ekranda ko‘rsatiladi.</p>
          </div>

          <div className="mt-10 space-y-3">
            {[
              [MessageCircleMore, "Kod Telegramga yuboriladi", "Telefon raqami ochiq xabarda ko‘rinmaydi."],
              [LockKeyhole, "5 urinishdan keyin himoya", "Takroriy noto‘g‘ri kodlar vaqtincha bloklanadi."],
              [Clock3, "Uzoq muddatli sessiya", "Tasdiqlangan qurilmada sessiya 365 kungacha yangilanadi."],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="flex gap-3 rounded-2xl border border-[#27272a] bg-[#18181b]/55 p-4">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#38bdf8]" />
                <div><p className="text-sm font-medium text-[#f4f4f5]">{String(title)}</p><p className="mt-1 text-xs leading-5 text-[#71717a]">{String(description)}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-[520px] items-center p-5 sm:p-10 lg:p-14">
          <div className="mx-auto w-full max-w-md">
            {tgPhase === "not-linked" && (
              <div className="mb-6 rounded-2xl border border-[#38bdf8]/25 bg-[#0ea5e9]/10 p-4">
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 h-5 w-5 shrink-0 text-[#38bdf8]" />
                  <div>
                    <p className="text-sm font-semibold text-[#f4f4f5]">Telegram akkauntingizni ulang</p>
                    <p className="mt-1 text-xs leading-5 text-[#a1a1aa]">Bir marta telefon kontaktingizni ulashing — keyingi safar WebApp avtomatik ochiladi.</p>
                  </div>
                </div>
                <button type="button" disabled={loading} onClick={shareContactAndRetry} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 text-sm font-semibold text-white transition hover:bg-[#168ac0] disabled:opacity-50">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  Telefonni Telegram orqali ulash
                </button>
              </div>
            )}
            <div className="mb-8 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${step === "phone" ? "bg-[#0ea5e9] text-white" : "bg-[#10b981] text-white"}`}>{step === "phone" ? "1" : <CheckCircle2 className="h-4 w-4" />}</div>
              <div className="h-px flex-1 bg-[#27272a]"><div className={`h-px bg-[#0ea5e9] transition-all ${step === "code" ? "w-full" : "w-0"}`} /></div>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${step === "code" ? "bg-[#0ea5e9] text-white" : "border border-[#3f3f46] text-[#71717a]"}`}>2</div>
            </div>

            {error && <div role="alert" className="mb-5 flex gap-2.5 rounded-2xl border border-[#ef4444]/25 bg-[#ef4444]/10 p-3.5 text-sm leading-5 text-[#fca5a5]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

            {step === "phone" ? (
              <form onSubmit={sendCode}>
                <KeyRound className="h-8 w-8 text-[#38bdf8]" />
                <h2 className="mt-5 text-2xl font-semibold tracking-[-.02em]">Akkauntga kirish</h2>
                <p className="mt-2 text-sm leading-6 text-[#a1a1aa]">Ro‘yxatdan o‘tgan telefon raqamingizni kiriting. Agar akkaunt mavjud bo‘lsa, Telegramga bir martalik kod yuboramiz.</p>
                <label htmlFor="phone" className="mt-7 block text-xs font-semibold text-[#71717a]">Telefon raqami</label>
                <div className="relative mt-2">
                  <Smartphone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <input id="phone" type="tel" autoComplete="tel" autoFocus value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="+998 90 123 45 67" className="h-14 w-full rounded-2xl border border-[#3f3f46] bg-[#18181b] pl-11 pr-4 text-base outline-none transition placeholder:text-[#52525b] focus:border-[#38bdf8] focus:ring-4 focus:ring-[#0ea5e9]/10" />
                </div>
                <button disabled={loading || !phoneIsValid} className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#0ea5e9] px-4 text-sm font-semibold text-white transition hover:bg-[#0284c7] disabled:cursor-not-allowed disabled:opacity-45">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Telegramga kod yuborish</span><ArrowRight className="h-4 w-4" /></>}
                </button>
                <p className="mt-4 text-center text-xs leading-5 text-[#52525b]">Akkaunt topilmasa yangi profil avtomatik ochilmaydi.</p>
              </form>
            ) : (
              <form onSubmit={verifyCode}>
                <MessageCircleMore className="h-8 w-8 text-[#38bdf8]" />
                <h2 className="mt-5 text-2xl font-semibold tracking-[-.02em]">Telegram kodini kiriting</h2>
                <p className="mt-2 text-sm leading-6 text-[#a1a1aa]"><span className="font-medium text-white">{phone}</span> uchun yuborilgan kirish kodini kiriting.</p>
                {notice && <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#10b981]/20 bg-[#10b981]/10 px-3 py-2.5 text-xs text-[#6ee7b7]"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
                {devCode && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2.5 text-xs text-[#fde68a]">
                    <span>Lokal test kodi: <code className="ml-1 font-mono text-sm font-bold tracking-[.18em] text-white">{devCode}</code></span>
                    <button type="button" onClick={() => setCode(devCode)} className="rounded-lg bg-[#f59e0b] px-2.5 py-1 font-semibold text-black hover:bg-[#fbbf24]">Kiritish</button>
                  </div>
                )}
                <label htmlFor="code" className="mt-7 block text-xs font-semibold text-[#71717a]">6 xonali kod</label>
                <input ref={codeInput} id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-2 h-16 w-full rounded-2xl border border-[#3f3f46] bg-[#18181b] px-4 text-center font-mono text-2xl tracking-[.42em] outline-none transition placeholder:text-[#3f3f46] focus:border-[#38bdf8] focus:ring-4 focus:ring-[#0ea5e9]/10" />
                <button disabled={loading || code.length !== 6} className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#0ea5e9] px-4 text-sm font-semibold text-white transition hover:bg-[#0284c7] disabled:cursor-not-allowed disabled:opacity-45">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Tasdiqlash va kirish</span><ArrowRight className="h-4 w-4" /></>}
                </button>
                <div className="mt-5 flex items-center justify-between text-xs">
                  <button type="button" onClick={changePhone} className="flex items-center gap-1.5 text-[#a1a1aa] transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Raqamni o‘zgartirish</button>
                  <button type="button" disabled={loading || resendTimer > 0} onClick={() => void sendCode()} className="flex items-center gap-1.5 text-[#38bdf8] transition hover:text-[#7dd3fc] disabled:text-[#52525b]"><RefreshCw className="h-3.5 w-3.5" />{resendTimer ? `${resendTimer} soniya` : "Kodni qayta yuborish"}</button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
