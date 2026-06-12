"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TelegramStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramStatsService = exports.EXPENSE_CATEGORIES = void 0;
exports.categoryDef = categoryDef;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../common/database/prisma.service");
const finance_sync_service_1 = require("../finance/finance-sync.service");
const date_fns_1 = require("date-fns");
exports.EXPENSE_CATEGORIES = [
    { key: 'SHIPPING', label: 'Yetkazib berish', emoji: '🚚' },
    { key: 'PACKAGING', label: 'Qadoqlash', emoji: '📦' },
    { key: 'ADVERTISING', label: 'Reklama', emoji: '📣' },
    { key: 'COMMISSION', label: 'Komissiya', emoji: '🏷' },
    { key: 'TAX', label: 'Soliq', emoji: '🧾' },
    { key: 'SALARY', label: 'Maosh', emoji: '👷' },
    { key: 'RENT', label: 'Ijara', emoji: '🏢' },
    { key: 'OTHER', label: 'Boshqa', emoji: '🔖' },
];
function categoryDef(key) {
    return (exports.EXPENSE_CATEGORIES.find((c) => c.key === key) || {
        key: 'OTHER',
        label: 'Boshqa',
        emoji: '🔖',
    });
}
let TelegramStatsService = TelegramStatsService_1 = class TelegramStatsService {
    constructor(prisma, finance, config) {
        this.prisma = prisma;
        this.finance = finance;
        this.config = config;
        this.logger = new common_1.Logger(TelegramStatsService_1.name);
        const raw = Number(this.config.get('USD_RATE'));
        this.fallbackRate = Number.isFinite(raw) && raw > 0 ? raw : 12900;
    }
    async getUsdRate(userId) {
        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { usdRate: true },
        });
        return u?.usdRate && u.usdRate > 0 ? u.usdRate : this.fallbackRate;
    }
    async formatProfitCard(userId, range) {
        const stores = await this.getStoresForUser(userId);
        if (!stores.length) {
            return '🏪 Sizda do\'kon yo\'q. Avval saytdan do\'kon qo\'shing.';
        }
        const rate = await this.getUsdRate(userId);
        const results = await Promise.all(stores.map(async (s) => {
            try {
                const sum = await this.finance.getDashboardSummary(userId, s.id, {
                    timeRange: range,
                });
                return { name: s.name, sum, error: null };
            }
            catch (e) {
                this.logger.warn(`dashboard summary failed for store ${s.id}: ${e.message}`);
                return { name: s.name, sum: null, error: 'API ulanmagan yoki xato' };
            }
        }));
        const ok = results.filter((r) => r.sum);
        const failed = results.filter((r) => !r.sum);
        let income = 0;
        let costUsd = 0;
        let orders = 0;
        let units = 0;
        let costedQty = 0;
        let totalSoldQty = 0;
        let from = 0;
        let to = 0;
        for (const r of ok) {
            const d = r.sum;
            income += Number(d.revenue) || 0;
            costUsd += Number(d.costUsd) || 0;
            orders += Number(d.orders) || 0;
            units += Number(d.unitsSold) || 0;
            costedQty += Number(d.coverage?.costedQty) || 0;
            totalSoldQty += Number(d.coverage?.totalSoldQty) || 0;
            if (d.dateFrom)
                from = from ? Math.min(from, d.dateFrom) : d.dateFrom;
            if (d.dateTo)
                to = Math.max(to, d.dateTo);
        }
        const costUzs = costUsd * rate;
        const net = income - costUzs;
        const margin = income > 0 ? (net / income) * 100 : 0;
        const costIncomplete = totalSoldQty > 0 && costedQty < totalSoldQty;
        const title = range === 'today'
            ? 'Bugungi savdo'
            : range === 'week'
                ? 'Haftalik savdo'
                : 'Oylik savdo';
        const lines = [];
        const dateLabel = from && to ? this.fmtRange(new Date(from), new Date(to)) : '';
        lines.push(`📊 <b>${title}</b>${dateLabel ? ' · ' + dateLabel : ''}`);
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push(`💰 <b>Sof foyda:</b> ${signedMoney(net)}` +
            (income > 0 ? ` · marja ${margin.toFixed(0)}%` : ''));
        lines.push(`📈 Daromad: ${money(income)}`);
        lines.push(`🏷 Tan narx: ${costUzs > 0 ? '−' + money(costUzs) : money(0)}`);
        lines.push(`📦 Buyurtma: <b>${orders}</b> · 🛍 <b>${units}</b> dona`);
        if (costIncomplete) {
            lines.push('');
            lines.push('⚠️ <i>Ba\'zi sotuvlarga tan narx kiritilmagan — marja taxminiy. ' +
                'Saytda mahsulot tan narxlarini to\'ldiring.</i>');
        }
        if (stores.length > 1) {
            lines.push('');
            lines.push('🏪 <b>Do\'konlar bo\'yicha:</b>');
            for (const r of ok) {
                const d = r.sum;
                const sNet = (Number(d.revenue) || 0) - (Number(d.costUsd) || 0) * rate;
                lines.push(`• ${escapeHtml(r.name)} — foyda ${signedMoney(sNet)} · ${Number(d.orders) || 0} buyurtma`);
            }
            for (const f of failed) {
                lines.push(`• ${escapeHtml(f.name)} — ⚠️ ${escapeHtml(f.error || '')}`);
            }
        }
        else if (failed.length) {
            lines.push('');
            lines.push(`⚠️ ${escapeHtml(failed[0].error || '')}`);
        }
        if (stores.length === 1 && ok.length === 1) {
            const top = ok[0].sum.topProducts || [];
            if (top.length) {
                lines.push('');
                lines.push('🏆 <b>Top mahsulotlar:</b>');
                for (const p of top.slice(0, 5)) {
                    lines.push(`• ${escapeHtml(p.name)} — ${money(Number(p.revenue) || 0)} (${Number(p.soldCount) || 0} dona)`);
                }
            }
        }
        if (orders === 0 && !failed.length) {
            lines.push('');
            lines.push('<i>Bu davrda buyurtma yo\'q.</i>');
        }
        return lines.join('\n');
    }
    async formatStoresList(userId) {
        const stores = await this.prisma.store.findMany({
            where: { userId },
            include: {
                connection: { select: { isConnected: true, lastSyncAt: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        if (!stores.length) {
            return '🏪 Sizda do\'kon yo\'q. Avval saytdan do\'kon qo\'shing.';
        }
        const lines = ['🏪 <b>Do\'konlaringiz:</b>', ''];
        for (const s of stores) {
            const conn = s.connection;
            const status = conn?.isConnected ? '🟢 Ulangan' : '⚪ Ulanmagan';
            const lastSync = conn?.lastSyncAt
                ? new Date(conn.lastSyncAt).toLocaleString('uz-UZ')
                : '—';
            lines.push(`<b>${escapeHtml(s.name)}</b>`);
            lines.push(`  Holat: ${status}`);
            lines.push(`  Oxirgi sync: ${lastSync}`);
            lines.push('');
        }
        return lines.join('\n').trim();
    }
    async getStoresForUser(userId) {
        return this.prisma.store.findMany({
            where: { userId },
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async userOwnsStore(userId, storeId) {
        const s = await this.prisma.store.findFirst({
            where: { id: storeId, userId },
            select: { id: true },
        });
        return !!s;
    }
    async addExpense(input) {
        return this.prisma.expense.create({
            data: {
                storeId: input.storeId,
                category: input.category,
                amount: input.amount,
                description: input.description,
                source: 'telegram',
                date: new Date(),
            },
            select: { id: true },
        });
    }
    async deleteExpense(userId, expenseId) {
        const storeIds = await this.getUserStoreIds(userId);
        const res = await this.prisma.expense.updateMany({
            where: { id: expenseId, storeId: { in: storeIds }, deletedAt: null },
            data: { deletedAt: new Date() },
        });
        return res.count > 0;
    }
    async formatExpensesList(userId, page, pageSize = 5) {
        const storeIds = await this.getUserStoreIds(userId);
        if (!storeIds.length) {
            return { text: '🏪 Sizda do\'kon yo\'q.', items: [], page: 0, totalPages: 0 };
        }
        const where = { storeId: { in: storeIds }, deletedAt: null };
        const total = await this.prisma.expense.count({ where });
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(Math.max(0, page), totalPages - 1);
        const rows = await this.prisma.expense.findMany({
            where,
            orderBy: { date: 'desc' },
            skip: safePage * pageSize,
            take: pageSize,
            select: {
                id: true,
                category: true,
                amount: true,
                description: true,
                date: true,
                store: { select: { name: true } },
            },
        });
        const monthAgo = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(new Date(), 29));
        const agg = await this.prisma.expense.aggregate({
            where: { ...where, date: { gte: monthAgo } },
            _sum: { amount: true },
        });
        const monthTotal = Number(agg._sum.amount || 0);
        const lines = [];
        lines.push('📉 <b>Xarajatlar</b>');
        lines.push(`30 kunlik jami: <b>${money(monthTotal)}</b>`);
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        if (!rows.length) {
            lines.push('');
            lines.push('<i>Hali xarajat kiritilmagan.</i>');
        }
        const items = rows.map((e) => {
            const cat = categoryDef(String(e.category));
            const when = new Date(e.date).toLocaleDateString('uz-UZ', {
                day: '2-digit',
                month: '2-digit',
            });
            lines.push('');
            lines.push(`${cat.emoji} <b>${money(Number(e.amount))}</b> · ${escapeHtml(cat.label)}`);
            lines.push(`   ${escapeHtml(e.description || '—')} · ${when} · ${escapeHtml(e.store?.name || '')}`);
            return {
                id: e.id,
                label: `${cat.emoji} ${money(Number(e.amount))} · ${when}`,
            };
        });
        return { text: lines.join('\n'), items, page: safePage, totalPages };
    }
    async getUserStoreIds(userId) {
        const stores = await this.prisma.store.findMany({
            where: { userId },
            select: { id: true },
        });
        return stores.map((s) => s.id);
    }
    fmtRange(from, to) {
        const f = from.toLocaleDateString('uz-UZ');
        const t = to.toLocaleDateString('uz-UZ');
        return f === t ? f : `${f} — ${t}`;
    }
};
exports.TelegramStatsService = TelegramStatsService;
exports.TelegramStatsService = TelegramStatsService = TelegramStatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        finance_sync_service_1.FinanceSyncService,
        config_1.ConfigService])
], TelegramStatsService);
function money(n) {
    return (Math.abs(Math.round(n)).toLocaleString('uz-UZ', {
        maximumFractionDigits: 0,
    }) + ' so\'m');
}
function signedMoney(n) {
    const sign = n < 0 ? '−' : '+';
    return sign + money(n);
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
//# sourceMappingURL=telegram-stats.service.js.map