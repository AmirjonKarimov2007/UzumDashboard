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
let FbsService = FbsService_1 = class FbsService {
    constructor(uzumClient, storesService) {
        this.uzumClient = uzumClient;
        this.storesService = storesService;
        this.logger = new common_1.Logger(FbsService_1.name);
        this.countsCache = new Map();
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
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        return this.uzumClient.getProducts(storeId, apiKey, uzumShopId, {
            page, size, filter, searchQuery, sortBy, order,
        });
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
        const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const statuses = [
            'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
            'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
            'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
        ];
        const result = {};
        for (const status of statuses) {
            result[status] = await this.uzumClient.getFbsOrderCount(storeId, apiKey, uzumShopId, status, dateFrom, dateTo);
            await new Promise((r) => setTimeout(r, 250));
        }
        this.countsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
        return result;
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
        this.countsCache.clear();
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
        return { orders };
    }
    async getLiveStocks(userId, storeId) {
        const { apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
        const { skuAmountList } = await this.uzumClient.getStocks(storeId, apiKey);
        return { stocks: skuAmountList, total: skuAmountList.length };
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
        const BATCH_SIZE = 4;
        for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
            const batch = orderIds.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(fetchOne));
            results.push(...batchResults);
            if (i + BATCH_SIZE < orderIds.length) {
                await new Promise((r) => setTimeout(r, 200));
            }
        }
        for (let pass = 0; pass < 2; pass++) {
            const failedIdx = results.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
            if (failedIdx.length === 0)
                break;
            this.logger.log(`Label retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
            for (const idx of failedIdx) {
                await new Promise((r) => setTimeout(r, 800 + pass * 500));
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
        const BATCH = 4;
        for (let i = 0; i < orderIds.length; i += BATCH) {
            const batch = orderIds.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(fetchOne));
            results.forEach((r, k) => { perOrder[i + k] = { orderId: batch[k], ...r }; });
            if (i + BATCH < orderIds.length)
                await new Promise((r) => setTimeout(r, 200));
        }
        for (let pass = 0; pass < 2; pass++) {
            const failedIdx = perOrder.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
            if (failedIdx.length === 0)
                break;
            this.logger.log(`Barcode retry pass ${pass + 1}: ${failedIdx.length} order(s)`);
            for (const idx of failedIdx) {
                await new Promise((r) => setTimeout(r, 800 + pass * 500));
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
        stores_service_1.StoresService])
], FbsService);
//# sourceMappingURL=fbs.service.js.map