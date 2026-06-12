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
var TelegramNotifyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramNotifyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const telegram_bot_service_1 = require("./telegram-bot.service");
let TelegramNotifyService = TelegramNotifyService_1 = class TelegramNotifyService {
    constructor(prisma, botService) {
        this.prisma = prisma;
        this.botService = botService;
        this.logger = new common_1.Logger(TelegramNotifyService_1.name);
    }
    async notifyNewOrder(storeId, order) {
        const bot = this.botService.getBot();
        if (!bot)
            return;
        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { name: true, userId: true },
        });
        if (!store)
            return;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId: store.userId },
        });
        if (!tu || !tu.isActive || !tu.notifyOrders)
            return;
        const text = this.formatNewOrder(store.name, order);
        const replyMarkup = {
            inline_keyboard: [
                [
                    {
                        text: '✅ Tasdiqlash',
                        callback_data: `cfm:${storeId}:${order.uzumOrderId}`,
                    },
                ],
            ],
        };
        try {
            if (order.imageUrl && text.length <= 1024) {
                try {
                    await bot.telegram.sendPhoto(tu.chatId, order.imageUrl, {
                        caption: text,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup,
                    });
                }
                catch (photoErr) {
                    this.logger.warn(`sendPhoto failed (${photoErr?.message}); falling back to text`);
                    await bot.telegram.sendMessage(tu.chatId, text, {
                        parse_mode: 'HTML',
                        link_preview_options: { is_disabled: true },
                        reply_markup: replyMarkup,
                    });
                }
            }
            else {
                await bot.telegram.sendMessage(tu.chatId, text, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: true },
                    reply_markup: replyMarkup,
                });
            }
        }
        catch (e) {
            const msg = e?.message || String(e);
            if (msg.includes('403') ||
                msg.includes('blocked') ||
                msg.includes('chat not found') ||
                msg.includes('user is deactivated')) {
                await this.prisma.telegramUser
                    .update({ where: { id: tu.id }, data: { isActive: false } })
                    .catch(() => undefined);
                this.logger.warn(`Deactivated telegram user ${tu.id} (chat ${tu.chatId}): ${msg}`);
            }
            else {
                this.logger.error(`Failed to notify chat ${tu.chatId} for store ${storeId}: ${msg}`);
            }
        }
    }
    async notifyInvoiceDeadline(storeId, inv) {
        const bot = this.botService.getBot();
        if (!bot)
            return;
        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { name: true, userId: true },
        });
        if (!store)
            return;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId: store.userId },
        });
        if (!tu || !tu.isActive || !tu.notifyOrders)
            return;
        const text = this.formatInvoiceDeadline(store.name, inv);
        try {
            await bot.telegram.sendMessage(tu.chatId, text, {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
            });
        }
        catch (e) {
            const msg = e?.message || String(e);
            if (msg.includes('403') ||
                msg.includes('blocked') ||
                msg.includes('chat not found') ||
                msg.includes('user is deactivated')) {
                await this.prisma.telegramUser
                    .update({ where: { id: tu.id }, data: { isActive: false } })
                    .catch(() => undefined);
                this.logger.warn(`Deactivated telegram user ${tu.id}: ${msg}`);
            }
            else {
                this.logger.error(`Failed to send invoice reminder to ${tu.chatId}: ${msg}`);
            }
        }
    }
    formatInvoiceDeadline(storeName, inv) {
        const lines = [];
        lines.push("⏰ <b>Ta'minlash muddati yaqinlashmoqda!</b>");
        lines.push(`🏪 <b>Do'kon:</b> ${escapeHtml(storeName)}`);
        lines.push(`🧾 <b>Ta'minlash:</b> #${escapeHtml(String(inv.number))}`);
        lines.push(`📦 <b>Buyurtmalar:</b> ${inv.numberOrders} ta`);
        if (inv.warehouse) {
            lines.push(`🏬 <b>Ombor:</b> ${escapeHtml(inv.warehouse)}`);
        }
        if (inv.address) {
            lines.push(`📍 <b>Topshirish joyi:</b> ${escapeHtml(inv.address)}`);
        }
        lines.push(`🕒 <b>Vaqt:</b> ${fmtSlot(inv.timeFrom, inv.timeTo)}`);
        lines.push(`⏳ <b>Qoldi:</b> ${humanizeRemaining(inv.remainingMs)}`);
        return lines.join('\n');
    }
    formatNewOrder(storeName, o) {
        const lines = [];
        lines.push(`🛒 <b>Yangi buyurtma!</b>`);
        lines.push(`🏪 <b>Do'kon:</b> ${escapeHtml(storeName)}`);
        lines.push(`#️⃣ <b>Order ID:</b> <code>${escapeHtml(o.uzumOrderId)}</code>`);
        if (o.scheme)
            lines.push(`📦 <b>Sxema:</b> ${o.scheme}`);
        lines.push(`📌 <b>Status:</b> ${escapeHtml(o.status)}`);
        lines.push(`💰 <b>Summa:</b> ${money(Number(o.total) || 0)}`);
        if (o.profit) {
            lines.push(`💚 <b>Foyda:</b> ${money(Number(o.profit) || 0)}`);
        }
        if (o.customerName) {
            lines.push(`👤 <b>Mijoz:</b> ${escapeHtml(o.customerName)}`);
        }
        if (o.customerPhone) {
            lines.push(`📞 <b>Tel:</b> ${escapeHtml(o.customerPhone)}`);
        }
        if (o.deliveryCity) {
            lines.push(`📍 <b>Shahar:</b> ${escapeHtml(o.deliveryCity)}`);
        }
        if (o.orderedAt) {
            lines.push(`🕒 <b>Vaqt:</b> ${new Date(o.orderedAt).toLocaleString('uz-UZ')}`);
        }
        if (o.items?.length) {
            lines.push('');
            lines.push('<b>Tovarlar:</b>');
            for (const it of o.items.slice(0, 10)) {
                lines.push(`• ${escapeHtml(it.name)} × ${it.quantity} — ${money(Number(it.price) || 0)}`);
            }
            if (o.items.length > 10) {
                lines.push(`… va yana ${o.items.length - 10} ta`);
            }
        }
        return lines.join('\n');
    }
};
exports.TelegramNotifyService = TelegramNotifyService;
exports.TelegramNotifyService = TelegramNotifyService = TelegramNotifyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_bot_service_1.TelegramBotService])
], TelegramNotifyService);
function money(n) {
    return n.toLocaleString('uz-UZ', { maximumFractionDigits: 0 }) + ' so\'m';
}
function humanizeRemaining(ms) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0)
        return `${h} soat ${m} daqiqa`;
    if (h > 0)
        return `${h} soat`;
    return `${m} daqiqa`;
}
function fmtSlot(fromMs, toMs) {
    const dt = (ms, opts) => new Date(ms).toLocaleString('uz-UZ', opts);
    const day = dt(fromMs, { day: '2-digit', month: '2-digit' });
    const from = dt(fromMs, { hour: '2-digit', minute: '2-digit' });
    if (!toMs)
        return `${day} ${from}`;
    const to = dt(toMs, { hour: '2-digit', minute: '2-digit' });
    return `${day} ${from}–${to}`;
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
//# sourceMappingURL=telegram-notify.service.js.map