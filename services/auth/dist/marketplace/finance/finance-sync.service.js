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
var FinanceSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const stores_service_1 = require("../stores/stores.service");
const date_fns_1 = require("date-fns");
const fs = require("fs/promises");
const path = require("path");
const WITHDRAWAL_KEYWORDS = [
    'вывод',
    'выплат',
    'мблаг',
    'mablag',
    'yechib olish',
    "so'rovnoma",
    'withdraw',
    'payout',
    'transfer to account',
];
const FINE_KEYWORDS = [
    'штраф',
    'пенал',
    'санкц',
    'удержан',
    'неустойк',
    'jarima',
    'penal',
    'fine',
    'forfeit',
    'sanction',
    'uzum market',
];
const SERVICE_KEYWORDS = [
    'логистик',
    'logistika',
    'logistic',
    'доставк',
    'yetkazib',
    'delivery',
    'shipping',
    'упаковк',
    'qadoq',
    'packaging',
    'фулфилм',
    'fulfillment',
    'хранен',
    'saqlash',
    'storage',
    'обработк',
    'процессинг',
    'processing',
    'сборк',
    'комплект',
    'сервис',
    'xizmat',
    'service',
];
const INCOME_KEYWORDS = [
    'возврат',
    'возмещен',
    'компенсац',
    'qaytarish',
    'qaytar',
    'kompensatsiya',
    'refund',
    'reimburs',
    'compensation',
    'credit back',
];
const matchesAny = (kws, expense) => {
    const blob = `${expense.type || ''} ${expense.description || ''} ${expense.source || ''}`.toLowerCase();
    return kws.some((kw) => blob.includes(kw));
};
const isWithdrawal = (e) => matchesAny(WITHDRAWAL_KEYWORDS, e);
const isFine = (e) => matchesAny(FINE_KEYWORDS, e);
const isService = (e) => matchesAny(SERVICE_KEYWORDS, e);
const isIncome = (e) => {
    if (typeof e.amount === 'number' && e.amount < 0)
        return true;
    return matchesAny(INCOME_KEYWORDS, e);
};
let FinanceSyncService = FinanceSyncService_1 = class FinanceSyncService {
    diskCachePath(storeId, dateFrom, dateTo) {
        const bucket = (ms) => (ms ? Math.floor(ms / (60 * 60 * 1000)) : 'all');
        return path.join(this.diskCacheDir, `${storeId}-${bucket(dateFrom)}-${bucket(dateTo)}.json`);
    }
    async readDiskCache(filePath) {
        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async writeDiskCache(filePath, payload) {
        try {
            await fs.mkdir(this.diskCacheDir, { recursive: true });
            const entry = { fetchedAt: Date.now(), payload };
            await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
            this.logger.log(`Disk cache written: ${path.basename(filePath)} (${(JSON.stringify(entry).length / 1024).toFixed(1)} KB)`);
        }
        catch (err) {
            this.logger.warn(`Disk cache write failed: ${err?.message}`);
        }
    }
    constructor(prisma, uzumClient, storesService) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.storesService = storesService;
        this.logger = new common_1.Logger(FinanceSyncService_1.name);
        this.reconCache = new Map();
        this.RECON_CACHE_TTL_MS = 5 * 60 * 1000;
        this.reconInflight = new Map();
        this.diskCacheDir = path.join(process.cwd(), '.cache', 'finance');
        this.diskCacheTtlMs = 24 * 60 * 60 * 1000;
        this.swrStore = new Map();
        this.swrInflight = new Map();
    }
    swrDiskPath(key) {
        const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.diskCacheDir, `swr-${safe}.json`);
    }
    swrRun(key, producer) {
        const existing = this.swrInflight.get(key);
        if (existing)
            return existing;
        const p = (async () => {
            const payload = await producer();
            this.swrStore.set(key, { fetchedAt: Date.now(), payload });
            void this.writeDiskCache(this.swrDiskPath(key), payload);
            return payload;
        })().finally(() => this.swrInflight.delete(key));
        this.swrInflight.set(key, p);
        return p;
    }
    swrRevalidate(key, producer) {
        if (this.swrInflight.has(key))
            return;
        void this.swrRun(key, producer).catch((e) => this.logger.warn(`SWR background refresh failed (${key}): ${e?.message}`));
    }
    async swr(opts) {
        const { key, ttlMs, force, producer } = opts;
        if (force)
            return this.swrRun(key, producer);
        const now = Date.now();
        let mem = this.swrStore.get(key);
        if (!mem) {
            const disk = await this.readDiskCache(this.swrDiskPath(key));
            if (disk) {
                this.swrStore.set(key, disk);
                mem = disk;
            }
        }
        if (mem) {
            const fresh = now - mem.fetchedAt < ttlMs;
            if (!fresh)
                this.swrRevalidate(key, producer);
            return { ...mem.payload, _cached: fresh ? 'fresh' : 'stale' };
        }
        return this.swrRun(key, producer);
    }
    async getLogisticsAndFines(userId, storeId, opts = {}) {
        return this.swr({
            key: `logfines:${storeId}`,
            ttlMs: this.RECON_CACHE_TTL_MS,
            force: opts.force,
            producer: () => this.computeLogisticsAndFines(userId, storeId),
        });
    }
    async computeLogisticsAndFines(userId, storeId) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const SIZE = 1500;
        const payments = [];
        for (let page = 0; page < 20; page++) {
            const { payments: pg, totalElements } = await this.uzumClient.getRawExpenses(storeId, apiKey, uzumShopId, page, SIZE);
            payments.push(...pg);
            if (pg.length < SIZE || payments.length >= totalElements)
                break;
        }
        const logistics = [];
        const fines = [];
        const refunds = [];
        for (const e of payments) {
            const unitPrice = Math.abs(Number(e.paymentPrice ?? 0));
            const qty = Number(e.amount ?? 1) || 1;
            const amount = unitPrice * qty;
            if (!amount)
                continue;
            const source = String(e.source || '').trim();
            const description = String(e.name || e.description || e.comment || source);
            const dateMs = e.dateCreated ? Number(e.dateCreated) : e.date ? new Date(e.date).getTime() : null;
            const status = String(e.status || 'UNKNOWN').toUpperCase();
            const id = String(e.id ?? `${source}-${dateMs}-${amount}`);
            const item = { id, amount, source, description, date: dateMs, status };
            const direction = String(e.type || '').toUpperCase();
            if (direction === 'INCOME') {
                refunds.push(item);
                continue;
            }
            const src = source.toLowerCase();
            if (src.includes('logistik')) {
                logistics.push(item);
            }
            else if (src.includes('uzum market') || src.includes('ombor')) {
                fines.push(item);
            }
        }
        const logisticsTotal = logistics.reduce((s, x) => s + x.amount, 0);
        const finesTotal = fines.reduce((s, x) => s + x.amount, 0);
        const refundsTotal = refunds.reduce((s, x) => s + x.amount, 0);
        const payload = {
            logisticsTotal,
            logisticsCount: logistics.length,
            finesTotal,
            finesCount: fines.length,
            combined: logisticsTotal + finesTotal,
            refundsTotal,
            refundsCount: refunds.length,
            totalExpenses: payments.length,
            fbsOrdersCount: payments.length,
            requestedSize: payments.length,
            logistics,
            fines,
            refunds,
        };
        return payload;
    }
    async getProcessingAndWithdraw(userId, storeId, opts = {}) {
        return this.swr({
            key: `procwithdraw:${storeId}`,
            ttlMs: this.RECON_CACHE_TTL_MS,
            force: opts.force,
            producer: () => this.computeProcessingAndWithdraw(userId, storeId),
        });
    }
    async computeProcessingAndWithdraw(userId, storeId) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const SIZE = 500;
        const fetchAll = async (status) => {
            const items = [];
            let apiTotal = 0;
            for (let page = 0; page < 40; page++) {
                const { orderItems, total } = await this.uzumClient.getFinanceOrders(storeId, apiKey, [uzumShopId], {
                    page, size: SIZE, statuses: [status], group: false,
                });
                apiTotal = total;
                items.push(...orderItems);
                if (orderItems.length < SIZE || items.length >= total)
                    break;
            }
            return { items, apiTotal };
        };
        const aggregate = (items) => {
            let total = 0;
            const uniqueOrderIds = new Set();
            for (const it of items) {
                total += Number(it.sellerProfit || 0) + Number(it.logisticDeliveryFee || 0);
                if (it.orderId != null)
                    uniqueOrderIds.add(it.orderId);
            }
            return { total, uniqueCount: uniqueOrderIds.size, itemsCount: items.length };
        };
        const [processing, withdraw] = await Promise.all([fetchAll('PROCESSING'), fetchAll('TO_WITHDRAW')]);
        const processingAgg = aggregate(processing.items);
        const withdrawAgg = aggregate(withdraw.items);
        return {
            processing: {
                total: processingAgg.total,
                count: processingAgg.uniqueCount,
                itemsCount: processingAgg.itemsCount,
                apiTotal: processing.apiTotal,
            },
            withdraw: {
                total: withdrawAgg.total,
                count: withdrawAgg.uniqueCount,
                itemsCount: withdrawAgg.itemsCount,
                apiTotal: withdraw.apiTotal,
            },
            combined: processingAgg.total + withdrawAgg.total,
            fbsActiveOrders: processingAgg.uniqueCount + withdrawAgg.uniqueCount,
            requestedSize: SIZE,
        };
    }
    resolveRange(timeRange) {
        const to = new Date();
        let from;
        switch (timeRange) {
            case 'week':
                from = (0, date_fns_1.subDays)(to, 7);
                break;
            case 'month':
                from = (0, date_fns_1.subDays)(to, 30);
                break;
            case 'quarter':
                from = (0, date_fns_1.subDays)(to, 90);
                break;
            case 'year':
                from = (0, date_fns_1.subDays)(to, 365);
                break;
            case 'today':
            default:
                from = (0, date_fns_1.startOfDay)(to);
                break;
        }
        return { from, to };
    }
    async getDashboardSummary(userId, storeId, opts = {}) {
        const timeRange = opts.timeRange || 'today';
        const hasCustom = opts.dateFrom != null && opts.dateTo != null;
        const bucket = (ms) => (ms != null ? Math.floor(ms / (60 * 60 * 1000)) : 'x');
        const key = hasCustom
            ? `dashboard:${storeId}:custom:${bucket(opts.dateFrom)}-${bucket(opts.dateTo)}`
            : `dashboard:${storeId}:${timeRange}`;
        return this.swr({
            key,
            ttlMs: this.RECON_CACHE_TTL_MS,
            force: opts.force,
            producer: () => this.computeDashboardSummary(userId, storeId, timeRange, opts.force, {
                dateFrom: opts.dateFrom, dateTo: opts.dateTo,
            }),
        });
    }
    resolveCosts(userId, storeId, force) {
        return this.getCostResolution(userId, storeId, force);
    }
    getCostResolution(userId, storeId, force) {
        return this.swr({
            key: `costres:${storeId}`,
            ttlMs: this.RECON_CACHE_TTL_MS,
            force,
            producer: () => this.computeCostResolution(userId, storeId),
        });
    }
    async computeCostResolution(userId, storeId) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const [allProducts, metas] = await Promise.all([
            this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId).catch((err) => {
                this.logger.warn(`CostRes: product list fetch failed: ${err?.message}`);
                return [];
            }),
            this.prisma.productMeta.findMany({
                where: { storeId, costPrice: { not: null } },
                select: { skuId: true, costPrice: true },
            }),
        ]);
        const activeProducts = allProducts.filter((p) => p?.isActive === true || p?.status?.value === 'IN_STOCK' || p?.status?.value === 'READY_TO_SEND').length;
        const costBySkuId = new Map();
        for (const m of metas) {
            if (m.costPrice != null)
                costBySkuId.set(m.skuId, Number(m.costPrice));
        }
        const costByFullTitle = {};
        const costsByProductId = new Map();
        for (const p of allProducts) {
            const pid = String(p?.productId ?? '');
            for (const s of p?.skuList || []) {
                const sid = s?.skuId != null ? String(s.skuId) : null;
                if (!sid)
                    continue;
                const cp = costBySkuId.get(sid);
                if (cp == null)
                    continue;
                if (s?.skuFullTitle)
                    costByFullTitle[s.skuFullTitle] = cp;
                if (s?.skuTitle)
                    costByFullTitle[s.skuTitle] = cp;
                if (pid) {
                    if (!costsByProductId.has(pid))
                        costsByProductId.set(pid, new Set());
                    costsByProductId.get(pid).add(cp);
                }
            }
        }
        const costByProductId = {};
        for (const [pid, set] of costsByProductId) {
            if (set.size === 1)
                costByProductId[pid] = [...set][0];
        }
        return { activeProducts, skusWithCost: costBySkuId.size, costByFullTitle, costByProductId };
    }
    async computeDashboardSummary(userId, storeId, timeRange, force, custom) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        let fromMs;
        let toMs;
        if (custom?.dateFrom != null && custom?.dateTo != null) {
            fromMs = Math.min(custom.dateFrom, custom.dateTo);
            toMs = Math.max(custom.dateFrom, custom.dateTo);
        }
        else {
            const { from, to } = this.resolveRange(timeRange);
            fromMs = from.getTime();
            toMs = to.getTime();
        }
        const PAGE_SIZE = 500;
        const MAX_PAGES = 40;
        const fetchAll = async () => {
            const out = [];
            for (let page = 0; page < MAX_PAGES; page++) {
                const resp = await this.uzumClient.getFinanceOrders(storeId, apiKey, [uzumShopId], {
                    page, size: PAGE_SIZE, group: false, dateFrom: fromMs, dateTo: toMs,
                });
                out.push(...resp.orderItems);
                if (resp.orderItems.length < PAGE_SIZE || out.length >= resp.total)
                    break;
            }
            return out;
        };
        const [items, cost] = await Promise.all([
            fetchAll().catch((err) => {
                this.logger.warn(`Dashboard: finance orders fetch failed: ${err?.message}`);
                return [];
            }),
            this.getCostResolution(userId, storeId, force),
        ]);
        let revenue = 0;
        let financeItems = 0;
        let costUsd = 0;
        let costedQty = 0;
        let totalSoldQty = 0;
        const orderIds = new Set();
        const soldTitles = new Set();
        for (const it of items) {
            const status = String(it.status || '').toUpperCase();
            if (it.cancelled === true || status === 'CANCELED' || status === 'CANCELLED')
                continue;
            revenue += Number(it.sellerProfit || 0);
            financeItems++;
            if (it.orderId != null)
                orderIds.add(it.orderId);
            const qty = Number(it.amount || 0) - Number(it.amountReturns || 0);
            if (qty <= 0)
                continue;
            totalSoldQty += qty;
            if (it.skuTitle)
                soldTitles.add(String(it.skuTitle));
            let cp = it.skuTitle != null ? cost.costByFullTitle[String(it.skuTitle)] : undefined;
            if (cp == null && it.productId != null)
                cp = cost.costByProductId[String(it.productId)];
            if (cp != null) {
                costUsd += cp * qty;
                costedQty += qty;
            }
        }
        const payload = {
            timeRange,
            dateFrom: fromMs,
            dateTo: toMs,
            revenue,
            orders: orderIds.size,
            activeProducts: cost.activeProducts,
            costUsd,
            coverage: {
                skusWithCost: cost.skusWithCost,
                skusSold: soldTitles.size,
                costedQty,
                totalSoldQty,
            },
            financeItems,
        };
        return payload;
    }
    async getReconciliation(userId, storeId, opts = {}) {
        const dateFrom = opts.dateFrom;
        const dateTo = opts.dateTo;
        const cacheKey = `${storeId}:${dateFrom ?? 'all'}:${dateTo ?? 'all'}`;
        const diskPath = this.diskCachePath(storeId, dateFrom, dateTo);
        if (!opts.force) {
            const cached = this.reconCache.get(cacheKey);
            if (cached && Date.now() - cached.fetchedAt < this.RECON_CACHE_TTL_MS) {
                return { ...cached.payload, _cached: 'memory', _cachedAt: cached.fetchedAt };
            }
            const inflight = this.reconInflight.get(cacheKey);
            if (inflight)
                return inflight;
        }
        if (!opts.force) {
            const disk = await this.readDiskCache(diskPath);
            if (disk && Date.now() - disk.fetchedAt < this.diskCacheTtlMs) {
                this.reconCache.set(cacheKey, disk);
                this.logger.log(`Disk cache HIT (fresh): ${path.basename(diskPath)}`);
                return { ...disk.payload, _cached: 'disk', _cachedAt: disk.fetchedAt };
            }
        }
        const work = (async () => {
            try {
                const payload = await this.fetchReconciliation(userId, storeId, dateFrom, dateTo);
                this.reconCache.set(cacheKey, { fetchedAt: Date.now(), payload });
                this.writeDiskCache(diskPath, payload).catch(() => { });
                return payload;
            }
            catch (err) {
                const disk = await this.readDiskCache(diskPath);
                if (disk) {
                    const ageH = ((Date.now() - disk.fetchedAt) / (60 * 60 * 1000)).toFixed(1);
                    this.logger.warn(`Live fetch failed (${err?.message}). Serving stale disk cache (age ${ageH}h).`);
                    return { ...disk.payload, _cached: 'disk-stale', _cachedAt: disk.fetchedAt, _fallbackReason: err?.message };
                }
                throw err;
            }
        })();
        this.reconInflight.set(cacheKey, work);
        try {
            return await work;
        }
        finally {
            this.reconInflight.delete(cacheKey);
        }
    }
    async getFbsBalance(userId, storeId, dateFrom, dateTo) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const fbsStatuses = [
            'CREATED',
            'PACKING',
            'PENDING_DELIVERY',
            'DELIVERING',
            'DELIVERED',
            'ACCEPTED_AT_DP',
            'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
            'COMPLETED',
        ];
        const ordersByStatus = {};
        let currentBalance = 0;
        for (const status of fbsStatuses) {
            try {
                await new Promise(r => setTimeout(r, 150));
                const orders = await this.uzumClient.getAllFbsOrders(storeId, apiKey, uzumShopId, [status], dateFrom, dateTo);
                if (orders.length === 0)
                    continue;
                ordersByStatus[status] ||= { count: 0, profit: 0, logistics: 0, total: 0 };
                ordersByStatus[status].count += orders.length;
                for (const order of orders) {
                    const sellerProfit = Number(order.sellerProfit || order.profit || 0);
                    const logistics = Number(order.logisticDeliveryFee || order.logistics || order.deliveryFee || 0);
                    const total = sellerProfit + logistics;
                    currentBalance += total;
                    ordersByStatus[status].profit += sellerProfit;
                    ordersByStatus[status].logistics += logistics;
                    ordersByStatus[status].total += total;
                }
                this.logger.log(`FBS status=${status} orders=${orders.length} balance=${ordersByStatus[status].total}`);
            }
            catch (err) {
                this.logger.warn(`FBS status=${status} failed: ${err?.message}`);
            }
        }
        return { currentBalance, ordersByStatus };
    }
    async fetchReconciliation(userId, storeId, dateFrom, dateTo) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const toMs = dateTo ?? Date.now();
        const fromMs = dateFrom ?? (Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
        this.logger.log(`Reconciliation FETCH for store=${storeId} shop=${uzumShopId} from=${new Date(fromMs).toISOString()} to=${new Date(toMs).toISOString()}`);
        const dataSources = {
            orders: 'none',
            expenses: 'none',
            errors: [],
        };
        let orderItems = [];
        let expenses = [];
        try {
            orderItems = await this.uzumClient.getAllFinanceOrders(storeId, apiKey, [uzumShopId], fromMs, toMs);
            dataSources.orders = 'uzum';
        }
        catch (err) {
            const msg = err?.message || 'finance/orders failed';
            this.logger.warn(`Uzum finance/orders failed (${msg}) — falling back to local DB orders`);
            dataSources.errors.push(`finance/orders: ${msg}`);
            const localOrders = await this.prisma.order.findMany({
                where: {
                    storeId,
                    orderedAt: { gte: new Date(fromMs), lte: new Date(toMs) },
                    status: { notIn: ['CANCELED', 'PENDING_CANCELLATION'] },
                },
                select: { subtotal: true, commission: true, deliveryFee: true, total: true, status: true, orderedAt: true },
            });
            orderItems = localOrders.map((o) => ({
                amount: Number(o.subtotal),
                commission: Number(o.commission),
                transfer: Number(o.total) - Number(o.commission) - Number(o.deliveryFee),
                status: o.status,
                orderDate: o.orderedAt?.toISOString(),
            }));
            if (localOrders.length > 0)
                dataSources.orders = 'local';
        }
        try {
            expenses = await this.uzumClient.getAllExpenses(storeId, apiKey, [uzumShopId], fromMs, toMs);
            dataSources.expenses = 'uzum';
            this.logger.log(`Uzum /v1/finance/expenses returned ${expenses.length} items`);
        }
        catch (err) {
            const msg = err?.message || 'finance/expenses failed';
            this.logger.warn(`Uzum finance/expenses failed (${msg}) — falling back to local DB expenses`);
            dataSources.errors.push(`finance/expenses: ${msg}`);
            const localExpenses = await this.prisma.expense.findMany({
                where: {
                    storeId,
                    date: { gte: new Date(fromMs), lte: new Date(toMs) },
                    deletedAt: null,
                },
                select: { id: true, category: true, description: true, amount: true, date: true, source: true, uzumRef: true },
            });
            expenses = localExpenses.map((e) => ({
                id: e.id,
                type: e.category,
                description: e.description,
                amount: Number(e.amount),
                date: e.date?.toISOString(),
                source: e.source,
                requestId: e.uzumRef,
            }));
            if (localExpenses.length > 0)
                dataSources.expenses = 'local';
        }
        let grossRevenue = 0;
        let totalCommission = 0;
        let totalLogistics = 0;
        let totalTransfer = 0;
        let ordersCount = 0;
        let currentBalance = 0;
        const ordersByStatus = {};
        for (const o of orderItems) {
            const sellPrice = Number(o.sellPrice || 0);
            const qty = Number(o.amount || 0);
            const returnsQty = Number(o.amountReturns || 0);
            const netQty = Math.max(0, qty - returnsQty);
            const gross = sellPrice * netQty;
            const commission = Number(o.commission || 0);
            const logistics = Number(o.logisticDeliveryFee || 0);
            const transfer = o.sellerProfit != null
                ? Number(o.sellerProfit)
                : Math.max(0, gross - commission - logistics);
            grossRevenue += gross;
            totalCommission += commission;
            totalLogistics += logistics;
            totalTransfer += transfer;
            ordersCount++;
            const st = String(o.status || 'UNKNOWN').toUpperCase();
            if (st === 'TO_WITHDRAW' || st === 'PROCESSING') {
                currentBalance += transfer + logistics;
            }
            ordersByStatus[st] ||= { count: 0, transfer: 0, commission: 0, gross: 0, logistics: 0 };
            ordersByStatus[st].count++;
            ordersByStatus[st].transfer += transfer;
            ordersByStatus[st].commission += commission;
            ordersByStatus[st].gross += gross;
            ordersByStatus[st].logistics += logistics;
        }
        const withdrawals = [];
        const fines = [];
        const services = [];
        const otherExpenses = [];
        const expensesByType = {};
        for (const e of expenses) {
            const amount = e.paymentPrice != null
                ? Math.abs(Number(e.paymentPrice)) * (Number(e.amount ?? 1) || 1)
                : Math.abs(Number(e.amount ?? 0));
            const source = String(e.source || 'UNKNOWN');
            const description = String(e.name || e.description || e.comment || source);
            const status = String(e.status || 'UNKNOWN').toUpperCase();
            const directionRaw = String(e.type || '').toUpperCase();
            const isIncomeApi = directionRaw === 'INCOME';
            const dateMs = e.dateCreated
                ? Number(e.dateCreated)
                : e.date
                    ? new Date(e.date).getTime()
                    : null;
            const refMatch = description.match(/#?(\d{6,})/);
            const uzumRef = e.externalId || e.requestId || e.requestNumber || refMatch?.[1];
            expensesByType[source] ||= { count: 0, total: 0, sample: description };
            expensesByType[source].count++;
            expensesByType[source].total += amount;
            const ctx = { type: source, description, source: e.source };
            if (isWithdrawal(ctx)) {
                withdrawals.push({
                    id: String(e.id ?? `${source}-${dateMs}-${amount}`),
                    uzumRef: uzumRef != null ? String(uzumRef) : undefined,
                    amount,
                    date: dateMs,
                    description,
                    type: source,
                    status,
                });
            }
            else if (isFine(ctx)) {
                fines.push({
                    id: String(e.id ?? `${source}-${dateMs}-${amount}`),
                    type: source,
                    description,
                    amount,
                    date: dateMs,
                    status,
                });
            }
            else if (isService(ctx)) {
                services.push({
                    id: String(e.id ?? `${source}-${dateMs}-${amount}`),
                    type: source,
                    description,
                    amount,
                    direction: isIncomeApi ? 'income' : directionRaw === 'OUTCOME' ? 'outcome' : isIncome(ctx) ? 'income' : 'outcome',
                    date: dateMs,
                    status,
                });
            }
            else {
                otherExpenses.push({
                    id: String(e.id ?? `${source}-${dateMs}-${amount}`),
                    type: source,
                    description,
                    amount,
                    date: dateMs,
                    status,
                });
            }
        }
        const withdrawalTotal = withdrawals.reduce((s, w) => s + w.amount, 0);
        const finesTotal = fines.reduce((s, f) => s + f.amount, 0);
        const otherExpensesTotal = otherExpenses.reduce((s, o) => s + o.amount, 0);
        const servicesIncome = services.filter((s) => s.direction === 'income').reduce((s, x) => s + x.amount, 0);
        const servicesOutcome = services.filter((s) => s.direction === 'outcome').reduce((s, x) => s + x.amount, 0);
        const servicesNet = servicesOutcome - servicesIncome;
        const servicesByStatus = {};
        for (const s of services) {
            servicesByStatus[s.status] ||= { count: 0, income: 0, outcome: 0, net: 0 };
            servicesByStatus[s.status].count++;
            if (s.direction === 'income')
                servicesByStatus[s.status].income += s.amount;
            else
                servicesByStatus[s.status].outcome += s.amount;
            servicesByStatus[s.status].net =
                servicesByStatus[s.status].outcome - servicesByStatus[s.status].income;
        }
        const netProfit = totalTransfer - otherExpensesTotal - finesTotal - servicesNet;
        const netProfitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
        const fbsBalance = await this.getFbsBalance(userId, storeId, fromMs, toMs);
        const computedBalance = fbsBalance.currentBalance;
        for (const [status, agg] of Object.entries(fbsBalance.ordersByStatus)) {
            ordersByStatus[status] ||= { count: 0, transfer: 0, commission: 0, gross: 0, logistics: 0 };
            ordersByStatus[status].count += agg.count;
            ordersByStatus[status].logistics += agg.logistics;
            ordersByStatus[status].transfer += agg.profit;
        }
        withdrawals.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
        fines.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
        services.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
        otherExpenses.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
        return {
            dateFrom: fromMs,
            dateTo: toMs,
            dataSources,
            sales: {
                ordersCount,
                grossRevenue,
                totalCommission,
                totalLogistics,
                totalTransfer,
                avgOrderValue: ordersCount > 0 ? grossRevenue / ordersCount : 0,
                commissionRate: grossRevenue > 0 ? (totalCommission / grossRevenue) * 100 : 0,
                logisticsRate: grossRevenue > 0 ? (totalLogistics / grossRevenue) * 100 : 0,
                byStatus: ordersByStatus,
            },
            withdrawals: {
                list: withdrawals,
                total: withdrawalTotal,
                count: withdrawals.length,
            },
            fines: {
                list: fines,
                total: finesTotal,
                count: fines.length,
            },
            services: {
                list: services,
                totalIncome: servicesIncome,
                totalOutcome: servicesOutcome,
                net: servicesNet,
                count: services.length,
                byStatus: servicesByStatus,
            },
            otherExpenses: {
                list: otherExpenses,
                total: otherExpensesTotal,
                count: otherExpenses.length,
            },
            expensesByType: Object.entries(expensesByType)
                .map(([type, v]) => {
                const blob = `${type} ${v.sample || ''}`.toLowerCase();
                const classified = WITHDRAWAL_KEYWORDS.some(kw => blob.includes(kw))
                    ? 'withdrawal'
                    : FINE_KEYWORDS.some(kw => blob.includes(kw))
                        ? 'fine'
                        : SERVICE_KEYWORDS.some(kw => blob.includes(kw))
                            ? 'service'
                            : 'other';
                return { type, count: v.count, total: v.total, sample: v.sample, classified };
            })
                .sort((a, b) => b.total - a.total),
            profit: {
                gross: grossRevenue,
                netAfterUzumCuts: totalTransfer,
                netProfit,
                netProfitMargin,
            },
            balance: {
                computed: computedBalance,
                formula: 'balance = SUM(FBS orderlarning sellerProfit + logisticDeliveryFee) - CREATED → COMPLETED',
                breakdown: {
                    fbsOrdersByStatus: fbsBalance.ordersByStatus,
                    totalBalance: computedBalance,
                },
            },
        };
    }
    async syncExpenses(storeId, uzumShopId, apiKey, dateFrom, dateTo) {
        const fromMs = dateFrom ? new Date(dateFrom).getTime() : (0, date_fns_1.subDays)(new Date(), 90).getTime();
        const toMs = dateTo ? new Date(dateTo).getTime() : new Date().getTime();
        this.logger.log(`Syncing expenses for store ${storeId} from ${dateFrom || 'last 90d'} to ${dateTo || 'now'}`);
        const expenses = await this.uzumClient.getAllExpenses(storeId, apiKey, [uzumShopId], fromMs, toMs);
        if (!expenses.length)
            return 0;
        let synced = 0;
        for (const e of expenses) {
            await this.prisma.expense.upsert({
                where: {
                    id: `uzum_${e.id}`,
                },
                create: {
                    id: `uzum_${e.id}`,
                    storeId,
                    category: this.mapExpenseCategory(e.type),
                    description: e.description || e.type,
                    amount: (e.amount || 0) / 100,
                    source: 'uzum',
                    uzumRef: String(e.id),
                    date: e.date ? new Date(e.date) : new Date(),
                },
                update: {
                    amount: (e.amount || 0) / 100,
                    description: e.description || e.type,
                },
            });
            synced++;
        }
        this.logger.log(`Synced ${synced} expenses for store ${storeId}`);
        return synced;
    }
    async buildAnalyticsSnapshots(storeId) {
        this.logger.log(`Building analytics snapshots for store ${storeId}`);
        const dateRange = await this.prisma.order.aggregate({
            where: { storeId, orderedAt: { not: null } },
            _min: { orderedAt: true },
            _max: { orderedAt: true },
        });
        if (!dateRange._min.orderedAt)
            return;
        const fromDate = (0, date_fns_1.startOfDay)(dateRange._min.orderedAt);
        const toDate = (0, date_fns_1.startOfDay)(dateRange._max.orderedAt || new Date());
        const days = (0, date_fns_1.eachDayOfInterval)({ start: fromDate, end: toDate });
        for (const day of days) {
            const dayStart = (0, date_fns_1.startOfDay)(day);
            const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
            const [ordersAgg, returnsAgg, commissionsAgg, expensesAgg] = await Promise.all([
                this.prisma.order.aggregate({
                    where: {
                        storeId,
                        orderedAt: { gte: dayStart, lte: dayEnd },
                        status: { notIn: ['CANCELED', 'RETURNED', 'PENDING_CANCELLATION'] },
                    },
                    _sum: { total: true, profit: true, commission: true },
                    _count: { id: true },
                }),
                this.prisma.order.aggregate({
                    where: {
                        storeId,
                        orderedAt: { gte: dayStart, lte: dayEnd },
                        status: { in: ['RETURNED', 'CANCELED'] },
                    },
                    _sum: { total: true },
                    _count: { id: true },
                }),
                this.prisma.order.aggregate({
                    where: { storeId, orderedAt: { gte: dayStart, lte: dayEnd } },
                    _sum: { commission: true },
                }),
                this.prisma.expense.aggregate({
                    where: { storeId, date: { gte: dayStart, lte: dayEnd }, deletedAt: null },
                    _sum: { amount: true },
                }),
            ]);
            const revenue = Number(ordersAgg._sum.total || 0);
            const commission = Number(commissionsAgg._sum.commission || 0);
            const expenseTotal = Number(expensesAgg._sum.amount || 0);
            const returnValue = Number(returnsAgg._sum.total || 0);
            const profit = revenue - commission - expenseTotal - returnValue;
            const netRevenue = revenue - returnValue;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            const productCount = await this.prisma.product.count({
                where: { storeId, status: 'ACTIVE', deletedAt: null },
            });
            await this.prisma.analyticsSnapshot.upsert({
                where: { storeId_date: { storeId, date: dayStart } },
                create: {
                    storeId,
                    date: dayStart,
                    revenue,
                    netRevenue,
                    orders: ordersAgg._count.id,
                    products: productCount,
                    commission,
                    profit,
                    margin,
                    returns: returnsAgg._count.id,
                    returnValue,
                },
                update: {
                    revenue,
                    netRevenue,
                    orders: ordersAgg._count.id,
                    products: productCount,
                    commission,
                    profit,
                    margin,
                    returns: returnsAgg._count.id,
                    returnValue,
                },
            });
        }
        this.logger.log(`Built analytics snapshots for ${days.length} days`);
    }
    mapExpenseCategory(type) {
        const upper = type?.toUpperCase() || '';
        if (upper.includes('COMMISSION') || upper.includes('КОМИССИЯ'))
            return 'COMMISSION';
        if (upper.includes('SHIPPING') || upper.includes('ДОСТАВКА'))
            return 'SHIPPING';
        if (upper.includes('ADVERTISING') || upper.includes('РЕКЛАМА'))
            return 'ADVERTISING';
        if (upper.includes('TAX') || upper.includes('НАЛОГ'))
            return 'TAX';
        if (upper.includes('PACKAGING') || upper.includes('УПАКОВКА'))
            return 'PACKAGING';
        return 'OTHER';
    }
};
exports.FinanceSyncService = FinanceSyncService;
exports.FinanceSyncService = FinanceSyncService = FinanceSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient,
        stores_service_1.StoresService])
], FinanceSyncService);
//# sourceMappingURL=finance-sync.service.js.map