"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Bell,
  Shield,
  Store,
  Palette,
  Key,
  Smartphone,
  Globe,
  Check,
  ChevronRight,
  Save,
  Link2,
  Link2Off,
  RefreshCw,
  Activity,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { useAuthStore } from "@/stores/auth-store";
import { cn, formatDateTime } from "@/lib/utils";
import { useConnectStore, useTestConnection, useSyncStatus, useFullSync, useDisconnectStore } from "@/hooks/use-sync";
import { useMe, useUpdateProfile } from "@/hooks/use-users";
import { toast } from "sonner";
import { useEffect } from "react";

const sections = [
  { id: "profile",       label: "Profil",          icon: User,    color: "#8b5cf6" },
  { id: "store",         label: "Do'kon ulanish",   icon: Store,   color: "#3b82f6" },
  { id: "notifications", label: "Bildirishnomalar", icon: Bell,    color: "#f59e0b" },
  { id: "security",      label: "Xavfsizlik",       icon: Shield,  color: "#10b981" },
  { id: "appearance",    label: "Ko'rinish",        icon: Palette, color: "#ec4899" },
  { id: "api",           label: "API kalitlar",     icon: Key,     color: "#71717a" },
];

const notifSettings = [
  { id: "new_order",    label: "Yangi buyurtma",   desc: "Buyurtma kelganda xabardor qiling" },
  { id: "stock_alert",  label: "Kam zaxira ogoh",  desc: "Mahsulot tugay deb qolganda" },
  { id: "ai_insight",   label: "AI tavsiyalar",    desc: "Yangi AI tavsiyalar tayyor bo'lganda" },
  { id: "daily_report", label: "Kunlik hisobot",   desc: "Har kuni soat 20:00 da" },
  { id: "payment",      label: "To'lov xabarlari", desc: "Uzum to'lovlari haqida" },
];

function SyncStatusBadge({ status }: { status?: string }) {
  const configs: Record<string, { color: string; label: string }> = {
    SUCCESS: { color: "#10b981", label: "Muvaffaqiyatli" },
    RUNNING: { color: "#f59e0b", label: "Jarayonda..." },
    FAILED:  { color: "#ef4444", label: "Xato" },
    PENDING: { color: "#71717a", label: "Kutilmoqda" },
  };
  const cfg = configs[status || "PENDING"] || configs.PENDING;
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const { user, activeStoreId } = useAuthStore();

  // Profile — fetched fresh from backend (source of truth, survives refresh)
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);

  // Sync local form state from backend / store whenever fresh data arrives
  useEffect(() => {
    if (!profileDirty) {
      setName(me?.name ?? user?.name ?? "");
      setEmail(me?.email ?? user?.email ?? "");
    }
  }, [me, user, profileDirty]);

  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    new_order: true, stock_alert: true, ai_insight: true, daily_report: false, payment: true,
  });
  const [twoFa, setTwoFa] = useState(false);

  // Uzum connection state
  const [uzumShopId, setUzumShopId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [editing, setEditing] = useState(false); // edit-mode for an already-connected store

  const connectStore = useConnectStore();
  const testConnection = useTestConnection();
  const fullSync = useFullSync();
  const disconnectStore = useDisconnectStore();
  const { data: syncStatus } = useSyncStatus();

  // Pre-fill the saved Shop ID once it loads (so the user sees what's connected).
  // The API key is never returned by the backend (encrypted) — left blank on purpose.
  useEffect(() => {
    if (!editing && syncStatus?.uzumShopId) setUzumShopId(String(syncStatus.uzumShopId));
    if (typeof syncStatus?.isAutoSync === "boolean") setAutoSync(syncStatus.isAutoSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.uzumShopId, syncStatus?.isAutoSync]);

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    updateProfile.mutate(
      {
        name: trimmedName || undefined,
        email: trimmedEmail || undefined,
      },
      {
        onSuccess: () => setProfileDirty(false),
      },
    );
  };

  const handleConnect = async () => {
    if (!uzumShopId.trim()) { toast.error("Shop ID kiriting"); return; }
    if (apiKey.length < 16) { toast.error("API kalit juda qisqa"); return; }
    if (!activeStoreId) return;

    connectStore.mutate(
      { storeId: activeStoreId, uzumShopId, apiKey, autoSync },
      { onSuccess: () => { setEditing(false); setApiKey(""); setShowApiKey(false); } },
    );
  };

  const handleDisconnect = () => {
    if (!confirm("Do'kon ulanishini o'chirasizmi? Shop ID va API kalit o'chiriladi va boshqa foydalanuvchi bu do'konni ulashi mumkin bo'ladi.")) return;
    disconnectStore.mutate(undefined, {
      onSuccess: () => { setEditing(false); setUzumShopId(""); setApiKey(""); setShowApiKey(false); },
    });
  };

  const handleTestConnection = async () => {
    const result = await testConnection.mutateAsync();
    if (result.healthy) {
      toast.success(`Ulanish muvaffaqiyatli! Do'kon: ${result.shopName} (${result.latencyMs}ms)`);
    } else {
      toast.error("Ulanish tekshiruvi muvaffaqiyatsiz");
    }
  };

  const handleFullSync = () => {
    fullSync.mutate();
  };

  const isConnected = syncStatus?.isConnected;

  return (
    <div className="space-y-6">
      <PageHeader title="Sozlamalar" subtitle="Profil va tizim sozlamalari" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar nav */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-2 space-y-1">
            {sections.map((s) => {
              const SectionIcon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                    activeSection === s.id
                      ? "bg-[#8b5cf6]/12 text-white"
                      : "text-[#71717a] hover:text-white hover:bg-[#18181b]"
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: activeSection === s.id ? `${s.color}20` : "transparent" }}
                  >
                    <SectionIcon className="w-4 h-4" style={{ color: activeSection === s.id ? s.color : undefined }} />
                  </div>
                  {s.label}
                  {s.id === "store" && isConnected && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-[#10b981]" />
                  )}
                  {activeSection === s.id && (
                    <ChevronRight className="w-4 h-4 ml-auto text-[#8b5cf6]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
          >
            {/* ── Profile ───────────────────────────────── */}
            {activeSection === "profile" && (
              <div>
                <div className="px-6 py-5 border-b border-[#18181b]">
                  <h2 className="text-sm font-semibold text-white">Profil ma'lumotlari</h2>
                  <p className="text-xs text-[#52525b] mt-0.5">Shaxsiy ma'lumotlaringizni yangilang</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center text-xl font-bold text-white">
                      {(name || user?.name || "U").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <button className="px-3 py-1.5 rounded-lg border border-[#27272a] text-xs text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all">
                        Rasm o'zgartirish
                      </button>
                      <p className="text-[11px] text-[#52525b] mt-1.5">PNG, JPG. Max 2MB</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#71717a] mb-2">Ism</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setProfileDirty(true); }}
                        placeholder="Ism familyangiz"
                        className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#71717a] mb-2">Telefon raqam</label>
                      <input
                        type="tel"
                        value={user?.phone || ""}
                        disabled
                        className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[#71717a] mb-2">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setProfileDirty(true); }}
                        placeholder="email@example.com"
                        className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-[#18181b] flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={updateProfile.isPending || !profileDirty}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateProfile.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : updateProfile.isSuccess && !profileDirty ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {updateProfile.isPending
                      ? "Saqlanmoqda..."
                      : updateProfile.isSuccess && !profileDirty
                        ? "Saqlandi!"
                        : "Saqlash"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Store Connection ──────────────────────── */}
            {activeSection === "store" && (
              <div>
                <div className="px-6 py-5 border-b border-[#18181b]">
                  <h2 className="text-sm font-semibold text-white">Uzum API ulanish</h2>
                  <p className="text-xs text-[#52525b] mt-0.5">Do'koningizni Uzum Seller API orqali ulang</p>
                </div>
                <div className="p-6 space-y-5">

                  {/* Connection status banner */}
                  <div className={cn(
                    "rounded-2xl p-4 flex items-center gap-3",
                    isConnected ? "bg-[#10b981]/10 border border-[#10b981]/20" : "bg-[#27272a] border border-[#3f3f46]"
                  )}>
                    {isConnected ? (
                      <Link2 className="w-5 h-5 text-[#10b981] flex-shrink-0" />
                    ) : (
                      <Link2Off className="w-5 h-5 text-[#71717a] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: isConnected ? "#10b981" : "#e4e4e7" }}>
                        {isConnected ? "Uzum API ulangan" : "Uzum API ulanmagan"}
                      </p>
                      {syncStatus?.lastSyncAt && (
                        <p className="text-xs text-[#71717a] mt-0.5">
                          Oxirgi sinxron: {formatDateTime(syncStatus.lastSyncAt)}
                        </p>
                      )}
                    </div>
                    {isConnected && <SyncStatusBadge status={syncStatus?.lastSyncStatus} />}
                  </div>

                  {/* Rate limit info */}
                  {isConnected && syncStatus && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-[#18181b] p-3">
                        <p className="text-[11px] text-[#52525b] mb-1">API so'rovlar (bugun)</p>
                        <p className="text-sm font-semibold text-white">
                          {syncStatus.rateLimitDayRemaining?.toLocaleString() || "—"} qoldi
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#18181b] p-3">
                        <p className="text-[11px] text-[#52525b] mb-1">Navbat</p>
                        <p className="text-sm font-semibold text-white">
                          {syncStatus.activeJobs} faol · {syncStatus.queuedJobs} kutmoqda
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Saved connection (read-only) — shown when connected & not editing ── */}
                  {isConnected && !editing && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-[#18181b] border border-[#27272a] p-3">
                          <p className="text-[11px] text-[#52525b] mb-1">Uzum Shop ID</p>
                          <p className="text-sm font-mono font-semibold text-white">{uzumShopId || syncStatus?.uzumShopId || "—"}</p>
                        </div>
                        <div className="rounded-xl bg-[#18181b] border border-[#27272a] p-3">
                          <p className="text-[11px] text-[#52525b] mb-1">API Kalit</p>
                          <p className="text-sm font-mono text-white tracking-widest">•••••••••••••• <span className="text-[10px] text-[#10b981] tracking-normal font-sans">saqlangan</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={() => { setEditing(true); setApiKey(""); }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-all"
                        >
                          <Pencil className="w-4 h-4" />
                          Tahrirlash
                        </button>
                        <button
                          onClick={handleDisconnect}
                          disabled={disconnectStore.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-sm text-[#ef4444] hover:bg-[#ef4444]/20 transition-all disabled:opacity-60"
                        >
                          {disconnectStore.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
                          O'chirish
                        </button>
                        <button
                          onClick={handleTestConnection}
                          disabled={testConnection.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
                        >
                          {testConnection.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                          Tekshirish
                        </button>
                        <button
                          onClick={handleFullSync}
                          disabled={fullSync.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
                        >
                          <RefreshCw className={cn("w-4 h-4", fullSync.isPending && "animate-spin")} />
                          To'liq sinxron
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Connection form — shown when not connected OR editing ── */}
                  {(!isConnected || editing) && (<>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#71717a] mb-2">
                        Uzum Shop ID <span className="text-[#ef4444]">*</span>
                      </label>
                      <input
                        type="text"
                        value={uzumShopId}
                        onChange={(e) => setUzumShopId(e.target.value)}
                        placeholder="Masalan: 12345"
                        className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                      />
                      <p className="text-[11px] text-[#52525b] mt-1.5">
                        Uzum Seller kabinetidagi Do'kon ID si
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#71717a] mb-2">
                        API Kalit <span className="text-[#ef4444]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={editing ? "Yangi API kalitni kiriting" : "Bearer token"}
                          className="w-full h-10 px-3 pr-10 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all font-mono"
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-white transition-colors"
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#52525b] mt-1.5">
                        Uzum Seller API → Sozlamalar → API kalitdan oling. Xavfsiz tarzda shifrlangan saqlangan.
                      </p>
                    </div>

                    {/* Auto sync toggle */}
                    <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-[#18181b]">
                      <div>
                        <p className="text-sm font-medium text-white">Avtomatik sinxronizatsiya</p>
                        <p className="text-xs text-[#52525b] mt-0.5">Buyurtmalar 5 daqiqada, mahsulotlar 30 daqiqada</p>
                      </div>
                      <button
                        onClick={() => setAutoSync(!autoSync)}
                        className={cn("relative w-10 rounded-full transition-all flex-shrink-0", autoSync ? "bg-[#8b5cf6]" : "bg-[#27272a]")}
                        style={{ height: "22px" }}
                      >
                        <div
                          className={cn("absolute top-0.5 rounded-full bg-white shadow-sm transition-all", autoSync ? "left-[calc(100%-20px)]" : "left-0.5")}
                          style={{ width: "18px", height: "18px" }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleConnect}
                      disabled={connectStore.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-60"
                    >
                      {connectStore.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      {connectStore.isPending ? "Saqlanmoqda..." : editing ? "Saqlash" : "Ulash va sinxronlash"}
                    </button>

                    {editing && (
                      <button
                        onClick={() => { setEditing(false); setApiKey(""); setUzumShopId(String(syncStatus?.uzumShopId || "")); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
                      >
                        Bekor qilish
                      </button>
                    )}

                    {isConnected && !editing && (
                      <>
                        <button
                          onClick={handleTestConnection}
                          disabled={testConnection.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
                        >
                          {testConnection.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                          Tekshirish
                        </button>

                        <button
                          onClick={handleFullSync}
                          disabled={fullSync.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
                        >
                          <RefreshCw className={cn("w-4 h-4", fullSync.isPending && "animate-spin")} />
                          To'liq sinxron
                        </button>
                      </>
                    )}
                  </div>
                  </>)}

                  {/* Recent sync logs */}
                  {syncStatus?.recentLogs?.length > 0 && (
                    <div className="border-t border-[#18181b] pt-4 mt-4">
                      <p className="text-xs font-semibold text-[#71717a] uppercase tracking-wider mb-3">
                        Sinxronizatsiya tarixi
                      </p>
                      <div className="space-y-2">
                        {syncStatus.recentLogs.slice(0, 5).map((log: any) => (
                          <div key={log.id} className="flex items-center gap-3 text-xs">
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", {
                              "bg-[#10b981]": log.status === "SUCCESS",
                              "bg-[#ef4444]": log.status === "FAILED",
                              "bg-[#f59e0b]": log.status === "RUNNING",
                              "bg-[#71717a]": log.status === "PENDING",
                            })} />
                            <span className="text-[#71717a]">{log.syncType}</span>
                            <span className="text-[#52525b]">·</span>
                            <span className="text-[#71717a]">{log.itemsSynced} element</span>
                            <span className="ml-auto text-[#3f3f46]">
                              {new Date(log.startedAt).toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Notifications ─────────────────────────── */}
            {activeSection === "notifications" && (
              <div>
                <div className="px-6 py-5 border-b border-[#18181b]">
                  <h2 className="text-sm font-semibold text-white">Bildirishnoma sozlamalari</h2>
                  <p className="text-xs text-[#52525b] mt-0.5">Qaysi hodisalar haqida xabardor qilinishingizni tanlang</p>
                </div>
                <div className="divide-y divide-[#18181b]">
                  {notifSettings.map((notif) => (
                    <div key={notif.id} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-white">{notif.label}</p>
                        <p className="text-xs text-[#52525b] mt-0.5">{notif.desc}</p>
                      </div>
                      <button
                        onClick={() => setNotifs((n) => ({ ...n, [notif.id]: !n[notif.id] }))}
                        className={cn("relative w-10 h-5.5 rounded-full transition-all flex-shrink-0", notifs[notif.id] ? "bg-[#8b5cf6]" : "bg-[#27272a]")}
                        style={{ height: "22px" }}
                      >
                        <div
                          className={cn("absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-all", notifs[notif.id] ? "left-[calc(100%-20px)]" : "left-0.5")}
                          style={{ width: "18px", height: "18px" }}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Security ──────────────────────────────── */}
            {activeSection === "security" && (
              <div>
                <div className="px-6 py-5 border-b border-[#18181b]">
                  <h2 className="text-sm font-semibold text-white">Xavfsizlik</h2>
                  <p className="text-xs text-[#52525b] mt-0.5">Hisobingizni himoya qiling</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="rounded-2xl bg-[#18181b] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#10b981]/15 flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-[#10b981]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Ikki bosqichli tekshirish</p>
                          <p className="text-xs text-[#52525b]">SMS orqali tasdiqlash</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setTwoFa(!twoFa)}
                        className={cn("relative w-10 rounded-full transition-all flex-shrink-0", twoFa ? "bg-[#10b981]" : "bg-[#27272a]")}
                        style={{ height: "22px" }}
                      >
                        <div
                          className={cn("absolute top-0.5 rounded-full bg-white shadow-sm transition-all", twoFa ? "left-[calc(100%-20px)]" : "left-0.5")}
                          style={{ width: "18px", height: "18px" }}
                        />
                      </button>
                    </div>
                    {twoFa && (
                      <div className="flex items-center gap-2 text-xs text-[#10b981] bg-[#10b981]/10 rounded-lg px-3 py-2 mt-2">
                        <Check className="w-3.5 h-3.5" />
                        Ikki bosqichli tekshirish faol
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[#18181b] p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-[#3b82f6]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Faol seanslar</p>
                        <p className="text-xs text-[#52525b]">Hozir kirilgan qurilmalar</p>
                      </div>
                    </div>
                    {[
                      { device: "Chrome — Windows 11", location: "Toshkent, UZ", current: true, time: "Hozir" },
                      { device: "Safari — iPhone 15",  location: "Toshkent, UZ", current: false, time: "2 soat oldin" },
                    ].map((session) => (
                      <div key={session.device} className="flex items-center justify-between py-3 border-t border-[#27272a] first:border-t-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-white">{session.device}</p>
                            {session.current && (
                              <span className="px-1.5 py-0.5 rounded-full bg-[#10b981]/15 text-[10px] text-[#10b981] font-semibold">Joriy</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#52525b] mt-0.5">{session.location} · {session.time}</p>
                        </div>
                        {!session.current && (
                          <button className="text-xs text-[#ef4444] hover:text-[#f87171] transition-colors">Chiqish</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {["appearance", "api"].includes(activeSection) && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
                  {activeSection === "appearance" && <Palette className="w-6 h-6 text-[#3f3f46]" />}
                  {activeSection === "api" && <Key className="w-6 h-6 text-[#3f3f46]" />}
                </div>
                <p className="text-sm font-semibold text-[#71717a]">Tez orada...</p>
                <p className="text-xs text-[#52525b] mt-1">Bu bo'lim ishlab chiqilmoqda</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
