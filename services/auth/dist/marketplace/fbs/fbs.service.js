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
var FbsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FbsService = void 0;
const common_1 = require("@nestjs/common");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const stores_service_1 = require("../stores/stores.service");
const finance_sync_service_1 = require("../finance/finance-sync.service");
let FbsService = FbsService_1 = class FbsService {
    constructor(uzumClient, storesService, financeSync) {
        this.uzumClient = uzumClient;
        this.storesService = storesService;
        this.financeSync = financeSync;
        this.logger = new common_1.Logger(FbsService_1.name);
        this.countsCache = new Map();
        this.productsCache = new Map();
        this.productsInflight = new Map();
        this.PRODUCTS_TTL_MS = 2 * 60 * 1000;
        this.productAnalyticsCache = new Map();
        this.PRODUCT_ANALYTICS_TTL_MS = 5 * 60 * 1000;
        this.countsInflight = new Map();
        this.stockMetaCache = new Map();
        this.STOCK_META_TTL_MS = 5 * 60 * 1000;
    }
    async getOrders(userId, storeId, status = 'PACKING', page = 0, size = 50, extra = {}) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        return this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size, extra);
    }
    async getAllOrders(userId, storeId, statuses = ['CREATED', 'PACKING', 'RETURNED']) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const orders = await this.uzumClient.getAllFbsOrders(storeId, apiKey, uzumShopId, statuses);
        return { count: orders.length, orders };
    }
    async getLabelPdf(userId, storeId, orderId, size = 'LARGE') {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const base64 = await this.uzumClient.getFbsLabelPdf(storeId, apiKey, orderId, size);
        if (!base64)
            return null;
        return Buffer.from(base64, 'base64');
    }
    async getLiveProducts(userId, storeId, page = 0, size = 50, filter, searchQuery, sortBy, order) {
        const key = `${storeId}:${page}:${size}:${filter || ''}:${searchQuery || ''}:${sortBy || ''}:${order || ''}`;
        const produce = async () => {
            const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
            return this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
                page, size, filter, searchQuery, sortBy, order,
            });
        };
        const run = () => {
            const existing = this.productsInflight.get(key);
            if (existing)
                return existing;
            const p = produce()
                .then((payload) => { this.productsCache.set(key, { fetchedAt: Date.now(), payload }); return payload; })
                .finally(() => this.productsInflight.delete(key));
            this.productsInflight.set(key, p);
            return p;
        };
        const cached = this.productsCache.get(key);
        if (cached) {
            if (Date.now() - cached.fetchedAt >= this.PRODUCTS_TTL_MS && !this.productsInflight.has(key)) {
                void run().catch((e) => this.logger.warn(`Products bg refresh failed: ${e?.message}`));
            }
            return cached.payload;
        }
        return run();
    }
    async getLiveFinanceOrders(userId, storeId, page = 0, size = 50, dateFrom, dateTo) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const { orderItems, total } = await this.uzumClient.getFinanceOrders(storeId, apiKey, [uzumShopId], { page, size, dateFrom, dateTo });
        return { orderItems, total, page, size };
    }
    async getOrderCounts(userId, storeId, dateFrom, dateTo) {
        const cacheKey = `${storeId}:${dateFrom ?? ''}:${dateTo ?? ''}`;
        const cached = this.countsCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        if (cached) {
            if (!this.countsInflight.has(cacheKey)) {
                void this.refreshOrderCounts(userId, storeId, cacheKey, dateFrom, dateTo).catch((e) => this.logger.warn(`Counts bg refresh failed: ${e?.message}`));
            }
            return cached.data;
        }
        return this.refreshOrderCounts(userId, storeId, cacheKey, dateFrom, dateTo);
    }
    refreshOrderCounts(userId, storeId, cacheKey, dateFrom, dateTo) {
        const existing = this.countsInflight.get(cacheKey);
        if (existing)
            return existing;
        const run = (async () => {
            const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
            const statuses = [
                'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
                'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
                'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
            ];
            const prev = this.countsCache.get(cacheKey)?.data;
            const result = {};
            const CHUNK = 3;
            for (let i = 0; i < statuses.length; i += CHUNK) {
                const chunk = statuses.slice(i, i + CHUNK);
                const counts = await Promise.all(chunk.map((status) => this.uzumClient.getFbsOrderCount(storeId, apiKey, uzumShopId, status, dateFrom, dateTo)));
                chunk.forEach((status, k) => {
                    const n = counts[k];
                    result[status] = n != null ? n : prev?.[status] ?? 0;
                });
                if (i + CHUNK < statuses.length)
                    await new Promise((r) => setTimeout(r, 200));
            }
            this.countsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
            return result;
        })().finally(() => this.countsInflight.delete(cacheKey));
        this.countsInflight.set(cacheKey, run);
        return run;
    }
    async getOrdersAdvanced(userId, storeId, params) {
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const { status = 'CREATED', page = 0, size = 20, dateFrom, dateTo, scheme } = params;
        const queryParams = { shopIds: uzumShopId, status, page, size };
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        if (scheme)
            queryParams.scheme = scheme;
        const data = await this.uzumClient.getFbsOrders(storeId, apiKey, uzumShopId, status, page, size);
        return { orders: data.orders, page, size, status };
    }
    async confirmOrder(userId, storeId, orderId) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const result = await this.uzumClient.confirmFbsOrder(storeId, apiKey, orderId);
        for (const entry of this.countsCache.values())
            entry.expiresAt = 0;
        return result;
    }
    async getInvoices(userId, storeId, statuses, page = 0, size = 20) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        return this.uzumClient.getFbsInvoices(storeId, apiKey, statuses, page, size);
    }
    async getInvoice(userId, storeId, invoiceId) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        return this.uzumClient.getFbsInvoiceById(storeId, apiKey, invoiceId);
    }
    async getInvoiceOrders(userId, storeId, invoiceId) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const orders = await this.uzumClient.getFbsInvoiceOrders(storeId, apiKey, invoiceId);
        try {
            const cost = await this.financeSync.resolveCosts(userId, storeId);
            const byTitle = cost?.costByFullTitle || {};
            const byPid = cost?.costByProductId || {};
            for (const o of orders || []) {
                const items = o?.items || o?.orderItems || [];
                for (const it of items) {
                    let cp = it?.skuTitle != null ? byTitle[String(it.skuTitle)] : undefined;
                    if (cp == null && it?.productId != null)
                        cp = byPid[String(it.productId)];
                    it.costUsd = cp != null ? cp : null;
                }
            }
        }
        catch (err) {
            this.logger.warn(`Invoice cost enrichment failed: ${err?.message}`);
        }
        return { orders };
    }
    pickStockImage(sku, product) {
        const normalize = (url) => {
            if (!url || typeof url !== 'string')
                return undefined;
            if (/^https?:\/\/images\.uzum\.uz\/[^/]+$/.test(url)) {
                return `${url}/t_product_540_high.jpg`;
            }
            return url;
        };
        const fromPhoto = (ph) => {
            if (!ph)
                return undefined;
            if (typeof ph === 'string')
                return normalize(ph);
            const obj = ph.photo || ph;
            if (typeof obj === 'string')
                return normalize(obj);
            for (const size of ['480', '540', '240', '800', '160']) {
                if (obj?.[size]?.high)
                    return normalize(obj[size].high);
                if (obj?.[size]?.low)
                    return normalize(obj[size].low);
            }
            return undefined;
        };
        return (fromPhoto(sku?.previewImage) ||
            fromPhoto(sku?.photo) ||
            fromPhoto(product?.image) ||
            fromPhoto(product?.previewImg));
    }
    async getStockMeta(userId, storeId, force = false) {
        const cached = this.stockMetaCache.get(storeId);
        if (!force && cached && Date.now() - cached.fetchedAt < this.STOCK_META_TTL_MS) {
            return cached.map;
        }
        const map = new Map();
        try {
            const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
            const client = this.uzumClient.buildClient(apiKey);
            const size = 50;
            let page = 0;
            let total = Infinity;
            while (page * size < total && page < 40) {
                const res = await client.get(`/v1/product/shop/${uzumShopId}`, {
                    params: { page, size, filter: 'ALL', sortBy: 'DEFAULT', order: 'DESC' },
                });
                const payload = res.data?.payload || res.data || {};
                const products = payload.productList || [];
                total = payload.totalProductsAmount ?? products.length;
                if (!products.length)
                    break;
                for (const p of products) {
                    const category = typeof p?.category === 'string' ? p.category : p?.category?.title || p?.category?.name || '';
                    for (const sku of p?.skuList || []) {
                        map.set(sku.skuId, {
                            image: this.pickStockImage(sku, p),
                            productId: p.productId,
                            price: Number(sku.price) || 0,
                            purchasePrice: Number(sku.purchasePrice) || 0,
                            sold: Number(sku.quantitySold) || 0,
                            category,
                            productTitle: sku.productTitle || p.title || '',
                            article: sku.article || '',
                            skuFullTitle: sku.skuFullTitle || sku.skuTitle || '',
                        });
                    }
                }
                page++;
                await new Promise((r) => setTimeout(r, 150));
            }
            this.stockMetaCache.set(storeId, { fetchedAt: Date.now(), map });
        }
        catch (err) {
            this.logger.warn(`Stock meta enrichment failed: ${err?.message}`);
            if (cached)
                return cached.map;
        }
        return map;
    }
    async getLiveStocks(userId, storeId, force = false) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
        const meta = await this.getStockMeta(userId, storeId, force);
        const stocks = (skuAmountList || []).map((s) => {
            const m = meta.get(s.skuId) || {};
            return {
                skuId: s.skuId,
                skuTitle: s.skuTitle,
                productTitle: s.productTitle || m.productTitle || '',
                barcode: s.barcode,
                amount: s.amount ?? 0,
                fbsLinked: s.fbsLinked ?? false,
                fbsAllowed: s.fbsAllowed ?? false,
                dbsLinked: s.dbsLinked ?? false,
                dbsAllowed: s.dbsAllowed ?? false,
                sellerSkuCode: s.sellerSkuCode ?? null,
                image: m.image || null,
                productId: m.productId ?? null,
                price: m.price ?? 0,
                purchasePrice: m.purchasePrice ?? 0,
                sold: m.sold ?? 0,
                category: m.category || '',
                article: m.article || '',
            };
        });
        const totalUnits = stocks.reduce((sum, x) => sum + (x.amount || 0), 0);
        const totalValue = stocks.reduce((sum, x) => sum + (x.amount || 0) * (x.price || 0), 0);
        return {
            stocks,
            total: stocks.length,
            totalUnits,
            totalValue,
            inStock: stocks.filter((x) => x.amount > 0).length,
            outOfStock: stocks.filter((x) => x.amount === 0).length,
        };
    }
    async setStocks(userId, storeId, updates) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
        const current = new Map((skuAmountList || []).map((s) => [s.skuId, s]));
        const items = [];
        const skipped = [];
        for (const u of updates) {
            const cur = current.get(Number(u.skuId));
            if (!cur) {
                skipped.push(u.skuId);
                continue;
            }
            const amount = Math.max(0, Math.floor(Number(u.amount) || 0));
            items.push({
                skuId: cur.skuId,
                barcode: String(cur.barcode),
                amount,
                fbsLinked: true,
                fbsAllowed: cur.fbsAllowed ?? true,
                dbsLinked: cur.dbsLinked ?? false,
                dbsAllowed: cur.dbsAllowed ?? false,
            });
        }
        if (items.length === 0) {
            return { totalRecords: 0, updatedRecords: 0, skipped };
        }
        const result = await this.uzumClient.setStocks(storeId, apiKey, items);
        return { ...result, skipped };
    }
    async getProductAnalytics(userId, storeId, force = false) {
        const cached = this.productAnalyticsCache.get(storeId);
        if (!force && cached && Date.now() - cached.fetchedAt < this.PRODUCT_ANALYTICS_TTL_MS) {
            return cached.payload;
        }
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const products = await this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId);
        const num = (v) => {
            const n = typeof v === 'string' ? parseFloat(v) : Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const normalizeImage = (url) => {
            if (!url || typeof url !== 'string')
                return null;
            if (/^https?:\/\/images\.uzum\.uz\/[^/]+$/.test(url))
                return `${url}/t_product_540_high.jpg`;
            return url;
        };
        let totalViewers = 0, totalSold = 0, totalReturned = 0, totalFeedback = 0;
        let inventoryUnits = 0, inventoryValue = 0, turnover = 0;
        let ratingSum = 0, ratingCount = 0, activeCount = 0, inStockCount = 0;
        const rankDist = {};
        const catMap = new Map();
        const rows = products.map((p) => {
            const viewers = num(p.viewers);
            const sold = num(p.quantitySold);
            const returned = num(p.quantityReturned);
            const stock = num(p.quantityFbs) || num(p.quantityActive) || num(p.quantityAvailable);
            const price = num(p.price);
            const rating = num(p.rating);
            const feedback = num(p.feedbackQuantity);
            const conversion = num(p.conversion);
            const returnedPct = num(p.returnedPercentage);
            const rowTurnover = price * sold;
            const statusValue = p?.status?.value || '';
            const statusTitle = p?.status?.title || '';
            const rank = p?.rankInfo?.rank || 'N';
            const category = (typeof p.category === 'string' && p.category) || p?.category?.title || 'Boshqa';
            const skuCount = Array.isArray(p.skuList) ? p.skuList.length : 0;
            const viewToSale = viewers > 0 ? (sold / viewers) * 100 : 0;
            totalViewers += viewers;
            totalSold += sold;
            totalReturned += returned;
            totalFeedback += feedback;
            inventoryUnits += stock;
            inventoryValue += price * stock;
            turnover += rowTurnover;
            if (rating > 0) {
                ratingSum += rating;
                ratingCount++;
            }
            if (statusValue !== 'ARCHIVED')
                activeCount++;
            if (stock > 0)
                inStockCount++;
            rankDist[rank] = (rankDist[rank] || 0) + 1;
            const cm = catMap.get(category) || { count: 0, sold: 0, turnover: 0 };
            cm.count++;
            cm.sold += sold;
            cm.turnover += rowTurnover;
            catMap.set(category, cm);
            return {
                productId: p.productId,
                title: p.title || '',
                image: normalizeImage(p.image) || normalizeImage(p.previewImg),
                category,
                price,
                sold,
                returned,
                returnedPct,
                stock,
                viewers,
                conversion,
                viewToSale,
                rating,
                feedback,
                roi: num(p.roi),
                rank,
                skuCount,
                turnover: rowTurnover,
                statusValue,
                statusTitle,
            };
        });
        const categories = [...catMap.entries()]
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.turnover - a.turnover);
        const payload = {
            totals: {
                products: products.length,
                active: activeCount,
                inStock: inStockCount,
                totalViewers,
                totalSold,
                totalReturned,
                totalFeedback,
                avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
                avgViewToSale: totalViewers > 0 ? (totalSold / totalViewers) * 100 : 0,
                returnRate: totalSold > 0 ? (totalReturned / totalSold) * 100 : 0,
                inventoryUnits,
                inventoryValue,
                turnover,
            },
            funnel: { viewers: totalViewers, sold: totalSold, returned: totalReturned },
            rankDist,
            categories,
            products: rows,
        };
        this.productAnalyticsCache.set(storeId, { fetchedAt: Date.now(), payload });
        return payload;
    }
    async getBatchLabelsPdf(userId, storeId, orderIds, size = 'LARGE') {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const fetchOne = async (orderId) => {
            try {
                const base64 = await this.uzumClient.getFbsLabelPdfFast(storeId, apiKey, orderId, size);
                return { orderId, ok: !!base64, document: base64 };
            }
            catch (err) {
                return { orderId, ok: false, error: err?.message, document: null };
            }
        };
        const results = [];
        const CONCURRENCY = 4;
        for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
            const batch = orderIds.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(fetchOne));
            results.push(...batchResults);
            if (i + CONCURRENCY < orderIds.length)
                await new Promise((r) => setTimeout(r, 100));
        }
        for (let pass = 0; pass < 3; pass++) {
            const failedIdx = results.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
            if (failedIdx.length === 0)
                break;
            this.logger.log(`Label retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
            for (const idx of failedIdx) {
                await new Promise((r) => setTimeout(r, 400 + pass * 400));
                results[idx] = await fetchOne(results[idx].orderId);
            }
        }
        return {
            total: results.length,
            success: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
            results,
        };
    }
    async getOrderItemBarcodes(userId, storeId, orderIds) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const client = this.uzumClient.buildClient(apiKey);
        const fetchOne = async (orderId) => {
            try {
                const res = await client.get(`/v1/fbs/order/${orderId}`, { timeout: 8_000 });
                const order = res.data?.payload;
                const items = (order?.orderItems || []).map((it) => ({
                    orderId: Number(orderId),
                    itemId: it.id,
                    barcode: String(it.barcode || ''),
                    skuTitle: it.skuTitle || '',
                    title: it.title || '',
                    amount: it.amount || 1,
                }));
                return { ok: true, items };
            }
            catch {
                return { ok: false, items: [] };
            }
        };
        const perOrder = orderIds.map((id) => ({ orderId: id, ok: false, items: [] }));
        const CONCURRENCY = 4;
        for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
            const batch = orderIds.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(fetchOne));
            results.forEach((r, k) => { perOrder[i + k] = { orderId: batch[k], ...r }; });
            if (i + CONCURRENCY < orderIds.length)
                await new Promise((r) => setTimeout(r, 100));
        }
        for (let pass = 0; pass < 3; pass++) {
            const failedIdx = perOrder.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
            if (failedIdx.length === 0)
                break;
            this.logger.log(`Barcode retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
            for (const idx of failedIdx) {
                await new Promise((r) => setTimeout(r, 400 + pass * 400));
                const r = await fetchOne(perOrder[idx].orderId);
                perOrder[idx] = { orderId: perOrder[idx].orderId, ...r };
            }
        }
        const items = perOrder.flatMap((r) => r.items);
        const failed = perOrder.filter((r) => !r.ok).length;
        if (failed > 0) {
            this.logger.warn(`Barcode batch: ${failed}/${orderIds.length} orders failed after retries`);
        }
        return { items, failedOrders: failed };
    }
};
exports.FbsService = FbsService;
exports.FbsService = FbsService = FbsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [uzum_api_client_1.UzumApiClient,
        stores_service_1.StoresService,
        finance_sync_service_1.FinanceSyncService])
], FbsService);
//# sourceMappingURL=fbs.service.js.map