"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldCheck, Smartphone, ArrowRight, CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Telegram WebApp obyektini biroz kutib oladi (SDK keyinroq yuklanishi mumkin). */
async function getTelegramInitData(timeoutMs = 3000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && typeof tg.initData === "string") {
      return tg.initData && tg.platform !== "unknown" ? tg.initData : null;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Telegram WebApp avto-login holati
  const [tgPhase, setTgPhase] = useState<"idle" | "checking" | "not-linked">("idle");
  const tgInitData = useRef<string | null>(null);
  const tgTried = useRef(false);

  // Login javobini qo'llab, dashboard'ga o'tkazadi
  const applyLogin = useCallback((data: any) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser({
      id: data.user.id,
      phone: data.user.phone,
      email: data.user.email ?? undefined,
      name: data.user.name ?? undefined,
      avatar: data.user.avatar ?? undefined,
      stores: (data.user.stores ?? []).map((s: any) => ({
        id: s.id, name: s.name, domain: s.domain ?? undefined, plan: s.plan ?? undefined,
      })),
    });
    router.push("/dashboard");
  }, [router, setTokens, setUser]);

  const tryTelegramLogin = useCallback(async (initData: string): Promise<"ok" | "not-linked" | "error"> => {
    try {
      const { data } = await axios.post(`${API_URL}/auth/telegram`, { initData });
      applyLogin(data);
      return "ok";
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (err?.response?.status === 404 || msg === "telegram_not_linked") return "not-linked";
      return "error";
    }
  }, [applyLogin]);

  // Telegram WebApp ichida ochilsa — parol so'ramasdan avtomatik kirishga urinamiz
  useEffect(() => {
    if (tgTried.current) return;
    tgTried.current = true;
    (async () => {
      const initData = await getTelegramInitData();
      if (!initData) return; // oddiy brauzer — odatdagi login
      tgInitData.current = initData;
      setTgPhase("checking");
      const res = await tryTelegramLogin(initData);
      if (res === "ok") return; // redirect bo'ldi
      setTgPhase("not-linked"); // telefon ulanmagan yoki xato — kontakt so'raymiz
    })();
  }, [tryTelegramLogin]);

  // Telegram'da kontakt (telefon) ulashishni so'raydi, keyin qayta urinadi
  const shareContactAndRetry = useCallback(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.requestContact) {
      setError("Telegram versiyangiz kontakt ulashni qo'llab-quvvatlamaydi. Botga /start yuborib telefon raqamni ulashing.");
      return;
    }
    setLoading(true);
    tg.requestContact(async (ok: any) => {
      const granted = ok === true || ok?.status === "sent" || ok?.status === "allowed";
      if (!granted) { setLoading(false); return; }
      // Bot kontaktni qabul qilib bog'lashi uchun bir necha marta qayta urinamiz
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const res = await tryTelegramLogin(tgInitData.current || "");
        if (res === "ok") return;
      }
      setLoading(false);
      setError("Telefon ulandi, lekin kirish hali tayyor emas. Yana bir marta urinib ko'ring.");
    });
  }, [tryTelegramLogin]);

  // Format phone number as +998 XX XXX XX XX
  const formatPhoneNumber = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (digits.length === 9 && !digits.startsWith("998")) digits = "998" + digits;
    if (digits.length > 12) digits = digits.slice(0, 12);

    let formatted = "+";
    for (let i = 0; i < Math.min(3, digits.length); i++) formatted += digits[i];
    if (digits.length > 3) { formatted += " "; for (let i = 3; i < Math.min(5, digits.length); i++) formatted += digits[i]; }
    if (digits.length > 5) { formatted += " "; for (let i = 5; i < Math.min(8, digits.length); i++) formatted += digits[i]; }
    if (digits.length > 8) { formatted += " "; for (let i = 8; i < Math.min(10, digits.length); i++) formatted += digits[i]; }
    if (digits.length > 10) { formatted += " "; for (let i = 10; i < digits.length; i++) formatted += digits[i]; }
    return formatted;
  };

  const getRawPhone = () => "+" + phone.replace(/\D/g, "");

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 12) {
      setError(`Telefon raqam to'liq emas (${digits.length}/12 ta raqam)`);
      setLoading(false);
      return;
    }
    if (!digits.startsWith("998")) {
      setError("O'zbekiston raqami bo'lishi kerak (+998...)");
      setLoading(false);
      return;
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/send-otp`, { phone: getRawPhone() });
      setStep("code");
      setCodeSent(true);
      startResendTimer();
      // Dev mode: backend returns OTP code for testing
      if (data?.devCode) {
        setDevCode(data.devCode);
        // Auto-fill for dev mode
        setCode(data.devCode);
      } else {
        setDevCode(null);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || "SMS yuborishda xato. Qayta urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.post(`${API_URL}/auth/send-otp`, { phone: getRawPhone() });
      setCode("");
      startResendTimer();
      if (data?.devCode) setDevCode(data.devCode);
      else setDevCode(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || "SMS yuborishda xato.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError("6 xonali raqamli kodni kiriting");
      setLoading(false);
      return;
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone: getRawPhone(),
        code,
      });

      // Save tokens first (before setUser, so API calls work immediately)
      setTokens(data.accessToken, data.refreshToken);

      // Save user with stores
      setUser({
        id: data.user.id,
        phone: data.user.phone,
        email: data.user.email ?? undefined,
        name: data.user.name ?? undefined,
        avatar: data.user.avatar ?? undefined,
        stores: (data.user.stores ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          domain: s.domain ?? undefined,
          plan: s.plan ?? undefined,
        })),
      });

      router.push("/dashboard");
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (err?.response?.status === 400) {
        setError("Kod noto'g'ri yoki muddati o'tgan. Qayta kod so'rang.");
      } else {
        setError(Array.isArray(msg) ? msg.join(", ") : msg || "Tasdiqlashda xato. Qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Telegram orqali avtomatik kirish jarayoni — to'liq ekran loader
  if (tgPhase === "checking") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#09090b] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-[#8b5cf6]/20 mb-5">
          <Send className="w-7 h-7 text-white" />
        </div>
        <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin mb-3" />
        <p className="text-[#fafafa] font-medium">Telegram orqali kirilmoqda…</p>
        <p className="text-[#71717a] text-sm mt-1">Bir lahza kuting</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#09090b] p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#8b5cf6]/10 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#10b981]/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary mx-auto flex items-center justify-center shadow-lg shadow-[#8b5cf6]/20 mb-4">
            <span className="text-white font-bold text-2xl">U</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#fafafa]">Uzum Dashboard</h1>
          <p className="text-[#71717a] mt-2">Do'koningizni boshqaring</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6 sm:p-8 shadow-xl">
          {/* Telegram: telefon ulanmagan — bir tugma bilan ulash */}
          {tgPhase === "not-linked" && (
            <div className="mb-6 rounded-xl bg-gradient-to-br from-[#229ED9]/15 to-[#229ED9]/5 border border-[#229ED9]/30 p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#229ED9]/20 flex items-center justify-center flex-shrink-0">
                  <Send className="w-4.5 h-4.5 text-[#229ED9]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Telegram orqali tezkor kirish</p>
                  <p className="text-[11px] text-[#a1a1aa]">Telefon raqamingizni bir marta ulang</p>
                </div>
              </div>
              <button
                onClick={shareContactAndRetry}
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#229ED9] hover:bg-[#1d8bc0] text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Smartphone className="w-4 h-4" /> Telefon raqamni ulashish</>}
              </button>
              <p className="text-[11px] text-[#52525b] text-center mt-2">yoki quyida raqam bilan kiring</p>
            </div>
          )}

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
              step === "code" ? "bg-[#10b981] text-white" : "bg-[#8b5cf6] text-white"
            }`}>
              {step === "code" ? <CheckCircle2 className="w-4 h-4" /> : "1"}
            </div>
            <div className={`flex-1 h-0.5 rounded-full transition-all ${step === "code" ? "bg-[#8b5cf6]" : "bg-[#27272a]"}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
              step === "code" ? "bg-[#8b5cf6] text-white" : "bg-[#18181b] text-[#71717a]"
            }`}>
              2
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ef4444] mt-0.5 flex-shrink-0" />
              <span className="text-sm text-[#ef4444]">{error}</span>
            </div>
          )}

          {step === "phone" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#71717a] mb-2">
                  Telefon raqam
                </label>
                <div className="relative">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#71717a]" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => { setPhone(formatPhoneNumber(e.target.value)); setError(""); }}
                    placeholder="+998 91 750 05 67"
                    className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#18181b] border border-[#27272a] text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-[#71717a] mt-2">Masalan: +998 91 750 05 67</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl gradient-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Kod yuborish"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-sm text-[#a1a1aa]">
                  <span className="text-[#fafafa] font-medium">{phone}</span> ga SMS kod yuborildi
                </p>
                <button
                  type="button"
                  onClick={() => { setStep("phone"); setCodeSent(false); setCode(""); setError(""); setDevCode(null); }}
                  className="text-[#8b5cf6] text-sm font-medium hover:underline mt-1"
                >
                  Raqamni o'zgartirish
                </button>
              </div>

              {/* Dev mode banner: shows OTP when SMS_PROVIDER=console */}
              {devCode && (
                <div className="rounded-xl bg-gradient-to-br from-[#f59e0b]/15 to-[#f59e0b]/5 border border-[#f59e0b]/30 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/20 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-[#f59e0b]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-[#f59e0b] font-semibold">Dev rejimi</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-lg font-mono font-bold text-[#fafafa] tracking-[0.3em]">{devCode}</code>
                      <button
                        type="button"
                        onClick={() => setCode(devCode)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#f59e0b] text-black font-semibold hover:bg-[#fbbf24] transition-colors"
                      >
                        Auto-fill
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#71717a] mb-2">
                  Tasdiqlash kodi
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full h-14 px-4 rounded-xl bg-[#18181b] border border-[#27272a] text-2xl font-mono text-center text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 tracking-[0.5em] transition-all"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full h-12 rounded-xl gradient-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Kirish</span> <ArrowRight className="w-4 h-4" /></>}
              </button>

              {/* Resend */}
              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-[#52525b]">
                    Qayta yuborish: <span className="text-[#71717a] font-mono">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="text-sm text-[#8b5cf6] hover:underline flex items-center gap-1 mx-auto disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Kodni qayta yuborish
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#71717a] mt-6">
          Kirish orqali{" "}
          <a href="#" className="text-[#8b5cf6] hover:underline">Foydalanish shartlari</a>{" "}
          va{" "}
          <a href="#" className="text-[#8b5cf6] hover:underline">Maxfiylik siyosati</a>
          {" "}ga rozilik bildirasiz
        </p>
      </div>
    </div>
  );
}
