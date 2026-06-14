"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Trash2,
  Filter,
  ShoppingCart,
  Package,
  Wallet,
  Boxes,
  Sparkles,
  Settings,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { mockNotifications, timeAgo } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { Notification, NotificationCategory, NotificationType } from "@/types";

const typeColor: Record<NotificationType, string> = {
  success: "#10b981",
  error:   "#ef4444",
  warning: "#f59e0b",
  info:    "#3b82f6",
  ai:      "#8b5cf6",
};

const categoryIcon: Record<NotificationCategory, React.ElementType> = {
  order:    ShoppingCart,
  product:  Package,
  finance:  Wallet,
  inventory:Boxes,
  ai:       Sparkles,
  system:   Settings,
  team:     Users,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory | "all">("all");

  const unread = notifications.filter((n) => !n.isRead).length;

  const filtered = notifications.filter(
    (n) => categoryFilter === "all" || n.category === categoryFilter
  );

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const categories: { id: NotificationCategory | "all"; label: string }[] = [
    { id: "all",       label: "Barchasi" },
    { id: "order",     label: "Buyurtmalar" },
    { id: "inventory", label: "Inventar" },
    { id: "ai",        label: "AI" },
    { id: "finance",   label: "Moliya" },
    { id: "system",    label: "Tizim" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bildirishnomalar"
        subtitle={unread > 0 ? `${unread} ta o'qilmagan` : "Hammas o'qilgan"}
        action={
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-medium text-[#71717a] hover:text-white transition-all"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Barchasini o'qilgan deb belgilash
          </button>
        }
      />

      {/* Category filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {categories.map((c) => {
          const count = notifications.filter(
            (n) => !n.isRead && (c.id === "all" || n.category === c.id)
          ).length;
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id as NotificationCategory | "all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                categoryFilter === c.id
                  ? "bg-[#8b5cf6] text-white"
                  : "bg-[#0f0f16] border border-[#27272a] text-[#71717a] hover:text-white"
              )}
            >
              {c.label}
              {count > 0 && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", categoryFilter === c.id ? "bg-white/20" : "bg-[#ef4444] text-white")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((notif, i) => {
            const color = typeColor[notif.type];
            const CategoryIcon = categoryIcon[notif.category] || Bell;

            return (
              <motion.div
                key={notif.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16, scale: 0.97 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
                onClick={() => markRead(notif.id)}
                className={cn(
                  "relative rounded-2xl border p-4 flex gap-4 cursor-pointer transition-all group",
                  notif.isRead
                    ? "bg-[#0f0f16] border-[#1c1c24] hover:border-[#27272a]"
                    : "bg-[#0f0f16] border-[#27272a] hover:border-[#3f3f46]"
                )}
              >
                {/* Unread indicator */}
                {!notif.isRead && (
                  <div
                    className="absolute left-0 inset-y-3 w-0.5 rounded-full"
                    style={{ background: color }}
                  />
                )}

                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}18` }}
                >
                  <CategoryIcon className="w-5 h-5" style={{ color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className={cn("text-sm font-semibold", notif.isRead ? "text-[#a1a1aa]" : "text-white")}>
                      {notif.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-[#3f3f46]">{timeAgo(notif.createdAt)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#27272a] text-[#52525b] hover:text-white transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#52525b] leading-relaxed">{notif.message}</p>
                  {notif.actionLabel && (
                    <a
                      href={notif.actionHref || "#"}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-block mt-2 text-xs font-semibold text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                    >
                      {notif.actionLabel} →
                    </a>
                  )}
                </div>

                {/* Unread dot */}
                {!notif.isRead && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: color }} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-5">
              <Bell className="w-8 h-8 text-[#3f3f46]" />
            </div>
            <h3 className="text-sm font-semibold text-[#71717a]">Bildirishnomalar yo'q</h3>
            <p className="text-xs text-[#52525b] mt-1">Yangi bildirishnomalar bu yerda paydo bo'ladi</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
