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
var ReturnsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReturnsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const stores_service_1 = require("../stores/stores.service");
const finance_sync_service_1 = require("../finance/finance-sync.service");
let ReturnsService = ReturnsService_1 = class ReturnsService {
    constructor(prisma, uzumClient, storesService, financeSync) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.storesService = storesService;
        this.financeSync = financeSync;
        this.logger = new common_1.Logger(ReturnsService_1.name);
        this.LOST_DAYS = 15;
        this.SYNC_TTL_MS = 10 * 60 * 1000;
        this.lastSync = new Map();
        this.inflight = new Map();
        this.toDto = (r) => ({
            id: r.id,
            returnId: r.publicId || r.uzumOrderId,
            publicId: r.publicId || null,
            uzumOrderId: r.uzumOrderId,
            productName: r.productName,
            skuTitle: r.skuTitle,
            barcode: r.barcode,
            quantity: r.quantity,
            costUsd: r.costUsd != null ? Number(r.costUsd) : null,
            salePrice: r.salePrice != null ? Number(r.salePrice) : null,
            reason: r.reason,
            status: r.status,
            manualReceived: r.manualReceived,
            orderedAt: r.orderedAt ? new Date(r.orderedAt).getTime() : null,
            returnedAt: r.returnedAt ? new Date(r.returnedAt).getTime() : null,
            receivedAt: r.receivedAt ? new Date(r.receivedAt).getTime() : null,
            daysWaiting: r.returnedAt ? Math.floor((Date.now() - new Date(r.returnedAt).getTime()) / 86_400_000) : null,
        });
    }
    async syncReturns(userId, storeId) {
        const existing = this.inflight.get(storeId);
        if (existing)
            return existing;
        const work = this.doSync(userId, storeId).finally(() => this.inflight.delete(storeId));
        this.inflight.set(storeId, work);
        return work;
    }
    async doSync(userId, storeId) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        await this.prisma.productReturn.updateMany({
            where: { storeId, manualReceived: true },
            data: { manualReceived: false, status: 'RETURNED', receivedAt: null },
        });
        const returnedOrders = await this.uzumClient
            .getAllFbsOrders(storeId, apiKey, uzumShopId, ['RETURNED'])
            .catch((e) => {
            this.logger.warn(`getAllFbsOrders(RETURNED) failed: ${e?.message}`);
            return [];
        });
        const returnsInvoices = await this.uzumClient
            .getSellerReturns(storeId, apiKey, uzumShopId, { size: 100 })
            .catch(() => []);
        const receivedQtyBySku = new Map();
        for (const inv of returnsInvoices) {
            const invId = inv?.id;
            if (!invId)
                continue;
            if (inv.status !== 'COMPLETED' || !inv.completedDate)
                continue;
            try {
                const detail = await this.uzumClient.getSellerReturnById(storeId, apiKey, uzumShopId, invId);
                for (const it of detail?.returnItems || []) {
                    const title = it?.skuTitle ? String(it.skuTitle).trim() : '';
                    if (!title)
                        continue;
                    const qty = Number(it?.packedAmount ?? it?.amount) || 0;
                    receivedQtyBySku.set(title, (receivedQtyBySku.get(title) || 0) + qty);
                }
            }
            catch (e) {
                this.logger.warn(`getSellerReturnById ${invId} failed: ${e?.message}`);
            }
        }
        const cost = await this.financeSync.resolveCosts(userId, storeId).catch(() => null);
        const byTitle = cost?.costByFullTitle || {};
        const byPid = cost?.costByProductId || {};
        const sortedOrders = [...returnedOrders].sort((a, b) => {
            const ad = a?.returnDate ?? a?.dateCancelled ?? a?.dateCreated ?? 0;
            const bd = b?.returnDate ?? b?.dateCancelled ?? b?.dateCreated ?? 0;
            return ad - bd;
        });
        const now = new Date();
        let upserts = 0;
        for (const o of sortedOrders) {
            const returnedMs = o?.returnDate ?? o?.dateCancelled ?? o?.dateCreated ?? null;
            const orderedMs = o?.dateCreated ?? null;
            const reason = o?.cancelReason || null;
            for (const it of o?.orderItems || []) {
                const skuTitle = it?.skuTitle ? String(it.skuTitle).trim() : '';
                const productId = it?.productId != null ? String(it.productId) : null;
                const costUsd = (skuTitle && byTitle[skuTitle] != null ? byTitle[skuTitle] : undefined) ??
                    (productId && byPid[productId] != null ? byPid[productId] : undefined) ??
                    null;
                const itemQty = Number(it?.amount) || 1;
                const remaining = skuTitle ? (receivedQtyBySku.get(skuTitle) || 0) : 0;
                const wasReceived = skuTitle && remaining >= itemQty;
                if (wasReceived) {
                    receivedQtyBySku.set(skuTitle, remaining - itemQty);
                }
                const key = { storeId, uzumOrderId: String(o.id), skuTitle };
                const prev = await this.prisma.productReturn.findUnique({
                    where: { storeId_uzumOrderId_skuTitle: key },
                });
                const status = wasReceived ? 'RECEIVED' : 'RETURNED';
                await this.prisma.productReturn.upsert({
                    where: { storeId_uzumOrderId_skuTitle: key },
                    create: {
                        storeId,
                        uzumOrderId: String(o.id),
                        publicId: o?.publicId ? String(o.publicId) : null,
                        skuTitle: skuTitle || null,
                        productId,
                        productName: it?.title || skuTitle || "Noma'lum",
                        barcode: it?.barcode != null ? String(it.barcode) : null,
                        quantity: Number(it?.amount) || 1,
                        costUsd: costUsd != null ? costUsd : null,
                        salePrice: it?.price != null ? Number(it.price) : null,
                        reason,
                        status: status,
                        orderedAt: orderedMs ? new Date(orderedMs) : null,
                        returnedAt: returnedMs ? new Date(returnedMs) : null,
                        lastSeenAt: now,
                    },
                    update: {
                        publicId: o?.publicId ? String(o.publicId) : prev?.publicId,
                        productName: it?.title || skuTitle || prev?.productName,
                        barcode: it?.barcode != null ? String(it.barcode) : prev?.barcode,
                        quantity: Number(it?.amount) || prev?.quantity || 1,
                        ...(costUsd != null ? { costUsd } : {}),
                        ...(it?.price != null ? { salePrice: Number(it.price) } : {}),
                        ...(reason ? { reason } : {}),
                        status: status,
                        ...(returnedMs ? { returnedAt: new Date(returnedMs) } : {}),
                        lastSeenAt: now,
                    },
                });
                upserts++;
            }
        }
        await this.detectLost(storeId);
        this.lastSync.set(storeId, Date.now());
        this.logger.log(`Returns sync: ${upserts} item(s) upserted for store ${storeId}`);
    }
    async detectLost(storeId) {
        const cutoff = new Date(Date.now() - this.LOST_DAYS * 86_400_000);
        await this.prisma.productReturn.updateMany({
            where: {
                storeId,
                status: 'RETURNED',
                returnedAt: { lt: cutoff },
            },
            data: { status: 'LOST' },
        });
    }
    async listInvoices(userId, storeId, page = 0, size = 20) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const invoices = await this.uzumClient.getSellerReturns(storeId, apiKey, uzumShopId, { page, size });
        return { invoices, page, size };
    }
    async getInvoice(userId, storeId, returnId) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const invoice = await this.uzumClient.getSellerReturnById(storeId, apiKey, uzumShopId, returnId);
        return { invoice };
    }
    async getAnalytics(userId, storeId, filters = {}) {
        const last = this.lastSync.get(storeId) || 0;
        if (filters.force || Date.now() - last > this.SYNC_TTL_MS) {
            await this.syncReturns(userId, storeId).catch((e) => this.logger.warn(`Returns sync failed (serving DB): ${e?.message}`));
        }
        else {
            await this.detectLost(storeId);
        }
        const rangeWhere = { storeId };
        if (filters.dateFrom != null || filters.dateTo != null) {
            rangeWhere.returnedAt = {};
            if (filters.dateFrom != null)
                rangeWhere.returnedAt.gte = new Date(filters.dateFrom);
            if (filters.dateTo != null)
                rangeWhere.returnedAt.lte = new Date(filters.dateTo);
        }
        const all = await this.prisma.productReturn.findMany({
            where: rangeWhere,
            orderBy: { returnedAt: 'desc' },
        });
        const list = all.filter((r) => {
            if (filters.status && r.status !== filters.status)
                return false;
            if (filters.product && !(r.productName || '').toLowerCase().includes(filters.product.toLowerCase()))
                return false;
            if (filters.sku && !(r.skuTitle || '').toLowerCase().includes(filters.sku.toLowerCase()) && !(r.barcode || '').includes(filters.sku))
                return false;
            return true;
        });
        const num = (d) => (d == null ? 0 : Number(d));
        const lost = all.filter((r) => r.status === 'LOST');
        const totalItems = all.length;
        const totalQty = all.reduce((s, r) => s + (r.quantity || 0), 0);
        const totalSaleValue = all.reduce((s, r) => s + num(r.salePrice) * (r.quantity || 1), 0);
        const totalCostUsd = all.reduce((s, r) => s + num(r.costUsd) * (r.quantity || 1), 0);
        const lostItems = lost.length;
        const lostQty = lost.reduce((s, r) => s + (r.quantity || 0), 0);
        const lostCostUsd = lost.reduce((s, r) => s + num(r.costUsd) * (r.quantity || 1), 0);
        const lostSaleValue = lost.reduce((s, r) => s + num(r.salePrice) * (r.quantity || 1), 0);
        const byStatus = { RETURNED: 0, READY_FOR_PICKUP: 0, RECEIVED: 0, LOST: 0 };
        for (const r of all)
            byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        const prodMap = new Map();
        for (const r of all) {
            const k = (r.skuTitle || r.productName || r.uzumOrderId);
            const e = prodMap.get(k) || { name: r.productName || '—', sku: r.skuTitle || '', qty: 0, saleValue: 0 };
            e.qty += r.quantity || 0;
            e.saleValue += num(r.salePrice) * (r.quantity || 1);
            prodMap.set(k, e);
        }
        const mostReturned = [...prodMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
        const monthMap = new Map();
        for (const r of all) {
            if (!r.returnedAt)
                continue;
            const d = new Date(r.returnedAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const e = monthMap.get(key) || { qty: 0, saleValue: 0, lost: 0 };
            e.qty += r.quantity || 0;
            e.saleValue += num(r.salePrice) * (r.quantity || 1);
            if (r.status === 'LOST')
                e.lost += r.quantity || 0;
            monthMap.set(key, e);
        }
        const byMonth = [...monthMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, v]) => ({ month, ...v }));
        const soldWhere = { order: { storeId } };
        if (rangeWhere.returnedAt) {
            soldWhere.order = { storeId, orderedAt: rangeWhere.returnedAt };
        }
        const soldAgg = await this.prisma.orderItem
            .aggregate({ _sum: { quantity: true }, where: soldWhere })
            .catch(() => ({ _sum: { quantity: null } }));
        const soldQty = Number(soldAgg?._sum?.quantity || 0);
        const returnRate = soldQty > 0 ? (totalQty / soldQty) * 100 : null;
        return {
            analytics: {
                totalItems,
                totalQty,
                totalSaleValue,
                totalCostUsd,
                lostItems,
                lostQty,
                lostCostUsd,
                lostSaleValue,
                returnRate,
                soldQty,
                byStatus,
                mostReturned,
                byMonth,
            },
            returns: list.map(this.toDto),
            lostReport: lost.map(this.toDto),
            lastSyncedAt: this.lastSync.get(storeId) || null,
        };
    }
};
exports.ReturnsService = ReturnsService;
exports.ReturnsService = ReturnsService = ReturnsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient,
        stores_service_1.StoresService,
        finance_sync_service_1.FinanceSyncService])
], ReturnsService);
//# sourceMappingURL=returns.service.js.map