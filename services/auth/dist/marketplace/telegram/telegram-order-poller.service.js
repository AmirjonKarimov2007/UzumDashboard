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
var TelegramOrderPoller_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramOrderPoller = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const stores_service_1 = require("../stores/stores.service");
const telegram_notify_service_1 = require("./telegram-notify.service");
let TelegramOrderPoller = TelegramOrderPoller_1 = class TelegramOrderPoller {
    constructor(prisma, stores, uzum, notify) {
        this.prisma = prisma;
        this.stores = stores;
        this.uzum = uzum;
        this.notify = notify;
        this.logger = new common_1.Logger(TelegramOrderPoller_1.name);
        this.seen = new Map();
        this.remindedInvoices = new Map();
        this.startedAt = Date.now();
        this.running = false;
        this.invoiceRunning = false;
    }
    async poll() {
        if (this.running)
            return;
        this.running = true;
        try {
            const connected = await this.stores.getConnectedStores();
            for (const { storeId } of connected) {
                await this.pollStore(storeId).catch((e) => this.logger.warn(`poll store ${storeId} failed: ${e.message}`));
            }
        }
        catch (e) {
            this.logger.warn(`order poll tick failed: ${e.message}`);
        }
        finally {
            this.running = false;
        }
    }
    async pollInvoices() {
        if (this.invoiceRunning)
            return;
        this.invoiceRunning = true;
        try {
            const connected = await this.stores.getConnectedStores();
            for (const { storeId } of connected) {
                await this.checkStoreInvoices(storeId).catch((e) => this.logger.warn(`invoice check ${storeId} failed: ${e.message}`));
            }
        }
        catch (e) {
            this.logger.warn(`invoice poll tick failed: ${e.message}`);
        }
        finally {
            this.invoiceRunning = false;
        }
    }
    async checkStoreInvoices(storeId) {
        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { userId: true },
        });
        if (!store)
            return;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId: store.userId },
            select: { isActive: true, notifyOrders: true },
        });
        if (!tu || !tu.isActive || !tu.notifyOrders)
            return;
        const creds = await this.stores.getStoreCredentials(store.userId, storeId);
        const { invoices } = await this.uzum.getFbsInvoices(storeId, creds.apiKey, [
            'CREATED',
            'ACCEPTANCE_IN_PROGRESS',
        ]);
        const now = Date.now();
        for (const inv of invoices) {
            const statusVal = inv?.status?.value;
            if (statusVal !== 'CREATED' && statusVal !== 'ACCEPTANCE_IN_PROGRESS') {
                continue;
            }
            const timeFrom = Number(inv?.timeSlot?.timeFrom || 0);
            if (!timeFrom)
                continue;
            const remaining = timeFrom - now;
            if (remaining <= 0)
                continue;
            const key = `${storeId}:${inv.id}`;
            let sent = this.remindedInvoices.get(key);
            if (!sent) {
                sent = new Set();
                this.remindedInvoices.set(key, sent);
            }
            const due = TelegramOrderPoller_1.REMIND_TIERS.filter((t) => remaining <= t && !sent.has(t));
            if (!due.length)
                continue;
            await this.notify.notifyInvoiceDeadline(storeId, {
                invoiceId: inv.id,
                number: inv.number ?? inv.id,
                numberOrders: Number(inv.numberOrders || 0),
                numberAcceptedOrders: Number(inv.numberAcceptedOrders || 0),
                warehouse: inv?.stock?.title || null,
                address: inv?.dropOffPoint?.address || inv?.stock?.address || null,
                timeFrom,
                timeTo: Number(inv?.timeSlot?.timeTo || 0) || null,
                remainingMs: remaining,
            });
            for (const t of TelegramOrderPoller_1.REMIND_TIERS) {
                if (remaining <= t)
                    sent.add(t);
            }
            this.logger.log(`Invoice reminder sent: store=${storeId} invoice=${inv.id} remaining=${Math.round(remaining / 60000)}min`);
        }
        if (this.remindedInvoices.size > 5000)
            this.remindedInvoices.clear();
    }
    async pollStore(storeId) {
        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { userId: true },
        });
        if (!store)
            return;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId: store.userId },
            select: { isActive: true, notifyOrders: true },
        });
        if (!tu || !tu.isActive || !tu.notifyOrders)
            return;
        const creds = await this.stores.getStoreCredentials(store.userId, storeId);
        const now = Date.now();
        const items = await this.uzum.getAllFinanceOrders(storeId, creds.apiKey, [creds.uzumShopId], now - 2 * 24 * 60 * 60 * 1000, now);
        const orders = this.groupByOrder(items);
        let seen = this.seen.get(storeId);
        if (!seen) {
            seen = new Set();
            this.seen.set(storeId, seen);
        }
        const fresh = orders
            .filter((o) => o.date > this.startedAt && !seen.has(o.orderId))
            .sort((a, b) => a.date - b.date);
        for (const o of fresh) {
            seen.add(o.orderId);
            if (o.cancelled)
                continue;
            try {
                await this.notify.notifyNewOrder(storeId, {
                    uzumOrderId: o.orderId,
                    status: o.status || 'PROCESSING',
                    total: o.total,
                    profit: o.profit,
                    customerName: null,
                    customerPhone: null,
                    deliveryCity: null,
                    orderedAt: new Date(o.date),
                    items: o.items,
                    imageUrl: o.image || null,
                });
            }
            catch (e) {
                this.logger.warn(`notify order ${o.orderId} failed: ${e.message}`);
            }
        }
        const notifiedCount = fresh.filter((o) => !o.cancelled).length;
        if (notifiedCount > 0) {
            this.logger.log(`Notified ${notifiedCount} new order(s) for store ${storeId}`);
        }
        if (seen.size > 20_000)
            seen.clear();
    }
    groupByOrder(items) {
        const map = new Map();
        for (const it of items) {
            const orderId = it?.orderId != null ? String(it.orderId) : '';
            if (!orderId)
                continue;
            const date = Number(it.date || it.dateIssued || 0);
            const statusUpper = String(it.status || '').toUpperCase();
            const cancelled = it.cancelled === true ||
                statusUpper === 'CANCELED' ||
                statusUpper === 'CANCELLED';
            const o = map.get(orderId) ||
                {
                    orderId,
                    date: 0,
                    status: it.status || '',
                    cancelled: false,
                    total: 0,
                    profit: 0,
                    image: '',
                    items: new Map(),
                };
            if (date > o.date) {
                o.date = date;
                o.status = it.status || o.status;
            }
            if (!o.image)
                o.image = pickImage(it);
            o.cancelled = o.cancelled || cancelled;
            o.profit += Number(it.sellerProfit || 0);
            const qty = Math.max(1, Number(it.amount || 0));
            const price = Number(it.sellPrice || 0);
            o.total += price * qty;
            const name = it.productTitle || it.skuTitle || 'Mahsulot';
            const line = o.items.get(name) || { quantity: 0, price };
            line.quantity += qty;
            o.items.set(name, line);
            map.set(orderId, o);
        }
        return [...map.values()].map((o) => ({
            orderId: o.orderId,
            date: o.date,
            status: o.status,
            cancelled: o.cancelled,
            total: o.total,
            profit: o.profit,
            image: o.image,
            items: [...o.items.entries()].map(([name, v]) => ({
                name,
                quantity: v.quantity,
                price: v.price,
            })),
        }));
    }
};
exports.TelegramOrderPoller = TelegramOrderPoller;
TelegramOrderPoller.REMIND_TIERS = [
    3 * 60 * 60 * 1000,
    60 * 60 * 1000,
    30 * 60 * 1000,
];
__decorate([
    (0, schedule_1.Cron)('*/2 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramOrderPoller.prototype, "poll", null);
__decorate([
    (0, schedule_1.Cron)('*/15 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramOrderPoller.prototype, "pollInvoices", null);
exports.TelegramOrderPoller = TelegramOrderPoller = TelegramOrderPoller_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        stores_service_1.StoresService,
        uzum_api_client_1.UzumApiClient,
        telegram_notify_service_1.TelegramNotifyService])
], TelegramOrderPoller);
function pickImage(it) {
    const photo = it?.productImage?.photo;
    if (!photo)
        return '';
    const sz = photo['240'] || photo['480'] || photo['120'] || photo['80'] || Object.values(photo)[0];
    return sz?.high || sz?.low || '';
}
//# sourceMappingURL=telegram-order-poller.service.js.map