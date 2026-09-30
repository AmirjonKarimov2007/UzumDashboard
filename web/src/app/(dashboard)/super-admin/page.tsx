"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Eye, KeyRound, Loader2, Search, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react';
import { useMe } from '@/hooks/use-users';
import { apiClient, getApiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

type Store = { id: string; name: string; status: string; plan: string; connection: null | {
  uzumShopId: string; isConnected: boolean; lastSyncAt: string | null; lastSyncStatus: string;
} };
type TelegramUser = { username: string | null; firstName: string | null; lastName: string | null; isActive: boolean } | null;
type User = {
  id: string; name: string | null; phone: string; isActive: boolean; hasPassword: boolean;
  createdAt: string; stores: Store[]; telegramUser: TelegramUser;
};
type Result = { totalUsers: number; totalStores: number; connectedStores: number; total: number; page: number; size: number; users: User[] };
type ImpersonationResponse = {
  accessToken: string;
  user: { id: string; phone: string; email?: string; name?: string; avatar?: string; stores: Store[] };
};

const secondaryButton = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#3f3f46] px-3 text-xs font-medium text-[#e4e4e7] hover:bg-[#27272a] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a78bfa]';

function StoreRow({ store }: { store: Store }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reveal = async () => {
    if (key) { setKey(null); return; }
    setBusy(true); setError('');
    try { setKey((await apiClient.get<{ apiKey: string }>(`/admin/stores/${store.id}/api-key`)).data.apiKey); }
    catch { setError('API kalitni olib bo‘lmadi. Ulanish va huquqni tekshiring.'); }
    finally { setBusy(false); }
  };
  return <div className="border-t border-[#27272a] py-3 space-y-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-[#e4e4e7]">{store.name} <span className="text-xs text-[#71717a]">{store.plan}</span></p>
        <p className="break-all text-xs text-[#71717a]">Do‘kon ID: <span className="select-all text-[#d4d4d8]">{store.id}</span></p>
        <p className="text-xs text-[#71717a]">Uzum ID: <span className="select-all text-[#d4d4d8]">{store.connection?.uzumShopId || 'Ulanmagan'}</span></p>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-xs', store.connection?.isConnected ? 'text-[#34d399]' : 'text-[#fbbf24]')}>{store.connection?.isConnected ? 'Ulangan' : 'Ulanmagan'}</span>
        <button className={secondaryButton} onClick={reveal} disabled={busy || !store.connection}>{busy ? 'Ochilmoqda…' : key ? 'Yashirish' : 'API kalit'}</button>
      </div>
    </div>
    {key && <textarea aria-label={`${store.name} API kaliti`} readOnly value={key} rows={3} className="w-full break-all rounded-lg border border-[#3f3f46] bg-[#18181b] p-3 text-xs text-white focus:outline-[#a78bfa]" />}
    {error && <p role="alert" className="text-xs text-[#fbbf24]">{error}</p>}
  </div>;
}

function PasswordEditor({ user, busy, onSave, onClose }: {
  user: User; busy: boolean; onSave: (password: string) => Promise<void>; onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setError('Parol kamida 8 ta belgidan iborat bo‘lsin');
    if (password !== confirm) return setError('Parollar bir xil emas');
    setError('');
    await onSave(password);
  };
  return <form onSubmit={submit} className="border-t border-[#27272a] bg-[#121218] px-4 py-4">
    <div className="mb-3">
      <p className="text-sm font-medium text-white">{user.name || user.phone} uchun yangi parol</p>
      <p className="mt-1 text-xs text-[#71717a]">Saqlanganda foydalanuvchining barcha eski sessiyalari bekor qilinadi.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Yangi parol" className="h-10 rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 text-sm text-white focus:outline-[#a78bfa]" />
      <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Parolni takrorlang" className="h-10 rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 text-sm text-white focus:outline-[#a78bfa]" />
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-[#f87171]">{error}</p>}
    <div className="mt-3 flex gap-2">
      <button type="submit" disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#8b5cf6] px-4 text-xs font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Parolni saqlash</button>
      <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Bekor qilish</button>
    </div>
  </form>;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const startImpersonation = useAuthStore((state) => state.startImpersonation);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [search]);
  const users = useQuery({
    queryKey: ['admin-users', me.data?.id, page, query],
    queryFn: async () => (await apiClient.get<Result>('/admin/users', { params: { page, search: query } })).data,
    enabled: me.data?.isSuperAdmin === true,
    staleTime: 15_000, gcTime: 0, retry: false,
  });

  const run = async (key: string, operation: () => Promise<void>) => {
    setWorking(key); setActionError('');
    try { await operation(); }
    catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setWorking(null); }
  };
  const changeStatus = (user: User) => run(`status:${user.id}`, async () => {
    await apiClient.patch(`/admin/users/${user.id}/status`, { isActive: !user.isActive });
    await users.refetch();
  });
  const savePassword = (user: User, password: string) => run(`password:${user.id}`, async () => {
    await apiClient.patch(`/admin/users/${user.id}/password`, { password });
    setEditingPassword(null);
    await users.refetch();
  });
  const removeUser = (user: User) => {
    if (!window.confirm(`${user.name || user.phone} akkaunti va uning barcha do‘konlarini butunlay o‘chirasizmi?`)) return;
    void run(`delete:${user.id}`, async () => {
      await apiClient.delete(`/admin/users/${user.id}`);
      await users.refetch();
    });
  };
  const inspectDashboard = (user: User) => run(`view:${user.id}`, async () => {
    const { data } = await apiClient.post<ImpersonationResponse>(`/admin/users/${user.id}/impersonate`);
    queryClient.clear();
    startImpersonation({
      id: data.user.id,
      phone: data.user.phone,
      email: data.user.email,
      name: data.user.name,
      avatar: data.user.avatar,
      stores: data.user.stores.map((store) => ({ id: store.id, name: store.name, plan: store.plan })),
    }, data.accessToken);
    router.push('/dashboard');
  });

  if (me.isLoading) return <p className="p-6 text-[#a1a1aa]">Huquqlar tekshirilmoqda…</p>;
  if (!me.data?.isSuperAdmin) return <div className="p-6 text-[#e4e4e7]"><p>Bu bo‘lim faqat super-admin uchun.</p>{me.isError && <button className={secondaryButton} onClick={() => me.refetch()}>Qayta tekshirish</button>}</div>;
  const result = users.data;
  return <div className="space-y-5">
    <PageHeader title="Super-admin" subtitle="Foydalanuvchi, kirish va do‘kon nazorati" action={<button className={secondaryButton} onClick={() => users.refetch()} disabled={users.isFetching}>Yangilash</button>} />
    {result && <div className="grid grid-cols-3 divide-x divide-[#27272a] border-y border-[#27272a] py-3 text-center text-xs text-[#71717a]">
      <span>Foydalanuvchi <strong className="ml-1 text-base text-white">{result.totalUsers}</strong></span>
      <span>Do‘kon <strong className="ml-1 text-base text-white">{result.totalStores}</strong></span>
      <span>Ulangan <strong className="ml-1 text-base text-[#34d399]">{result.connectedStores}</strong></span>
    </div>}
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
      <input aria-label="Foydalanuvchi yoki do‘konni qidirish" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Telefon, ism yoki do‘kon nomi…" className="w-full rounded-xl border border-[#27272a] bg-[#18181b] py-3 pl-11 pr-4 text-sm text-white focus:outline-[#a78bfa]" />
    </div>
    {actionError && <p role="alert" className="rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2 text-sm text-[#fca5a5]">{actionError}</p>}
    {users.isLoading && <p className="text-sm text-[#a1a1aa]">Foydalanuvchilar yuklanmoqda…</p>}
    {users.isError && <p role="alert" className="text-sm text-[#fbbf24]">Ro‘yxatni olib bo‘lmadi. Yangilash tugmasini bosing.</p>}
    <div className="space-y-3">
      {result?.users.map((user) => {
        const self = user.id === me.data?.id;
        return <article key={user.id} className={cn('overflow-hidden rounded-xl border bg-[#0f0f16]', user.isActive ? 'border-[#27272a]' : 'border-[#ef4444]/30')}>
          <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', user.isActive ? 'bg-[#10b981]/12 text-[#34d399]' : 'bg-[#ef4444]/12 text-[#f87171]')}>
                <UserRoundCog className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-white">{user.name || 'Ism kiritilmagan'}</h2>{self && <span className="rounded bg-[#8b5cf6]/15 px-1.5 py-0.5 text-[10px] text-[#c4b5fd]">Siz</span>}</div>
                <p className="text-sm text-[#a1a1aa]">{user.phone}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#71717a]">
                  <span className={user.isActive ? 'text-[#34d399]' : 'text-[#f87171]'}>{user.isActive ? 'Faol' : 'Bloklangan'}</span>
                  <span>{user.stores.length} do‘kon</span>
                  <span>{user.telegramUser?.isActive ? `Telegram${user.telegramUser.username ? ` @${user.telegramUser.username}` : ''}` : 'Telegram ulanmagan'}</span>
                  <span>{user.hasPassword ? 'Parol mavjud' : 'Parol o‘rnatilmagan'}</span>
                  <span>{new Date(user.createdAt).toLocaleDateString('uz-UZ')}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={secondaryButton} disabled={self || !user.isActive || !!working} onClick={() => inspectDashboard(user)}>{working === `view:${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Dashboardni ko‘rish</button>
              <button className={secondaryButton} disabled={!!working} onClick={() => setEditingPassword(editingPassword === user.id ? null : user.id)}><KeyRound className="h-3.5 w-3.5" /> Parol</button>
              <button className={cn(secondaryButton, user.isActive ? 'border-[#f59e0b]/35 text-[#fbbf24]' : 'border-[#10b981]/35 text-[#34d399]')} disabled={self || !!working} onClick={() => changeStatus(user)}>{working === `status:${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : user.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {user.isActive ? 'Bloklash' : 'Faollashtirish'}</button>
              <button className={cn(secondaryButton, 'border-[#ef4444]/35 text-[#f87171]')} disabled={self || !!working} onClick={() => removeUser(user)}>{working === `delete:${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} O‘chirish</button>
            </div>
          </div>
          {editingPassword === user.id && <PasswordEditor user={user} busy={working === `password:${user.id}`} onSave={(password) => savePassword(user, password)} onClose={() => setEditingPassword(null)} />}
          <div className="px-4">{user.stores.map((store) => <StoreRow key={store.id} store={store} />)}{!user.stores.length && <p className="border-t border-[#27272a] py-3 text-xs text-[#71717a]">Do‘kon qo‘shilmagan</p>}</div>
        </article>;
      })}
    </div>
    {result && !result.users.length && <div className="py-12 text-center text-sm text-[#71717a]"><ShieldCheck className="mx-auto mb-2 h-8 w-8 text-[#3f3f46]" />Foydalanuvchi topilmadi.</div>}
    {result && result.total > result.size && <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[#a1a1aa]">{page + 1} / {Math.ceil(result.total / result.size)} sahifa · {result.total} foydalanuvchi</p>
      <div className="flex gap-2"><button className={secondaryButton} onClick={() => setPage(page - 1)} disabled={!page || users.isFetching}>Oldingi</button><button className={secondaryButton} onClick={() => setPage(page + 1)} disabled={(page + 1) * result.size >= result.total || users.isFetching}>Keyingi</button></div>
    </div>}
  </div>;
}
