"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Mail,
  Phone,
  Shield,
  Crown,
  Eye,
  BarChart3,
  Settings,
  MoreHorizontal,
  X,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { mockTeamMembers, timeAgo } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { TeamRole } from "@/types";

const roleConfig: Record<TeamRole, { label: string; icon: React.ElementType; color: string; permissions: string[] }> = {
  owner:  { label: "Egasi",     icon: Crown,    color: "#f59e0b", permissions: ["Barcha huquqlar"] },
  admin:  { label: "Admin",     icon: Shield,   color: "#8b5cf6", permissions: ["Mahsulotlar", "Buyurtmalar", "Moliya", "Inventar"] },
  analyst:{ label: "Analitik",  icon: BarChart3,color: "#3b82f6", permissions: ["Analitika", "Hisobotlar"] },
  viewer: { label: "Ko'ruvchi", icon: Eye,      color: "#52525b", permissions: ["Faqat ko'rish"] },
};

export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jamoa"
        subtitle={`${mockTeamMembers.length} ta a'zo`}
        action={
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            A'zo qo'shish
          </button>
        }
      />

      {/* Role overview */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(Object.entries(roleConfig) as [TeamRole, typeof roleConfig[TeamRole]][]).map(([role, cfg], i) => {
          const count = mockTeamMembers.filter((m) => m.role === role).length;
          const RoleIcon = cfg.icon;
          return (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-4"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}18` }}>
                  <RoleIcon className="w-4 h-4" style={{ color: cfg.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{cfg.label}</p>
                  <p className="text-[11px] text-[#52525b]">{count} ta a'zo</p>
                </div>
              </div>
              <div className="space-y-1">
                {cfg.permissions.map((p) => (
                  <div key={p} className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 flex-shrink-0" style={{ color: cfg.color }} />
                    <span className="text-[11px] text-[#52525b]">{p}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Team members table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-[#0f0f16] border border-[#1c1c24] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#18181b]">
          <h2 className="text-sm font-semibold text-white">Jamoa a'zolari</h2>
        </div>
        <div className="divide-y divide-[#18181b]">
          {mockTeamMembers.map((member, i) => {
            const role = roleConfig[member.role];
            const RoleIcon = role.icon;
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-[#18181b]/40 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                  {member.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white">{member.name}</p>
                    <StatusBadge status={member.status} dot={false} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#52525b]">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {member.phone}
                    </span>
                    {member.email && (
                      <span className="flex items-center gap-1 hidden sm:flex">
                        <Mail className="w-3 h-3" />
                        {member.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${role.color}18` }}>
                    <RoleIcon className="w-3.5 h-3.5" style={{ color: role.color }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: role.color }}>{role.label}</span>
                </div>

                {/* Last active */}
                <div className="text-right flex-shrink-0 hidden lg:block">
                  <p className="text-[11px] text-[#52525b]">
                    {member.lastActive ? `Oxirgi: ${timeAgo(member.lastActive)}` : "Taklif yuborildi"}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {member.role !== "owner" && (
                    <button className="p-1.5 rounded-lg hover:bg-[#27272a] text-[#52525b] hover:text-white transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInvite(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] w-full max-w-[420px] mx-4"
            >
              <div className="rounded-2xl bg-[#0f0f16] border border-[#27272a] shadow-elevated overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#18181b]">
                  <h3 className="text-sm font-semibold text-white">Yangi a'zo qo'shish</h3>
                  <button onClick={() => setShowInvite(false)} className="p-1.5 rounded-lg hover:bg-[#18181b] text-[#52525b] hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-2">Telefon raqam</label>
                    <input
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full h-10 px-3 rounded-xl bg-[#18181b] border border-[#27272a] text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-2">Rol</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(roleConfig) as [TeamRole, typeof roleConfig[TeamRole]][])
                        .filter(([r]) => r !== "owner")
                        .map(([role, cfg]) => {
                          const RoleIcon = cfg.icon;
                          return (
                            <button
                              key={role}
                              onClick={() => setInviteRole(role)}
                              className={cn(
                                "flex items-center gap-2 p-3 rounded-xl border transition-all text-left",
                                inviteRole === role
                                  ? "border-[#8b5cf6] bg-[#8b5cf6]/10"
                                  : "border-[#27272a] hover:border-[#3f3f46]"
                              )}
                            >
                              <RoleIcon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
                              <div>
                                <p className="text-xs font-semibold text-white">{cfg.label}</p>
                                <p className="text-[10px] text-[#52525b]">{cfg.permissions[0]}</p>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 px-5 py-4 border-t border-[#18181b]">
                  <button
                    onClick={() => setShowInvite(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[#27272a] text-sm text-[#a1a1aa] hover:text-white transition-all"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Taklif yuborish
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
