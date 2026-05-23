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
var UzumApiClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UzumApiClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const prisma_service_1 = require("../../common/database/prisma.service");
let UzumApiClient = UzumApiClient_1 = class UzumApiClient {
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
        this.logger = new common_1.Logger(UzumApiClient_1.name);
        this.baseUrl = 'https://api-seller.uzum.uz/api/seller-openapi';
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }
    buildClient(apiKey) {
        return axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30_000,
            headers: {
                Authorization: apiKey,
                Accept: '*/*',
                'User-Agent': 'Uzum-Dashboard/1.0',
            },
        });
    }
    extractRateLimitInfo(headers) {
        return {
            remaining: parseInt(headers['x-ratelimit-remaining'] || '1000', 10),
            replenishRate: parseInt(headers['x-ratelimit-replenish-rate'] || '100', 10),
            burstCapacity: parseInt(headers['x-ratelimit-burst-capacity'] || '1000', 10),
            limitPerDay: parseInt(headers['x-ratelimit-limit-per-day'] || '10000', 10),
            remainingPerDay: parseInt(headers['x-ratelimit-remaining-per-day'] || '10000', 10),
            resetAt: null,
        };
    }
    async persistRateLimitInfo(storeId, info) {
        await this.prisma.storeConnection.updateMany({
            where: { store: { id: storeId } },
            data: {
                rateLimitRemaining: info.remaining,
                rateLimitDayRemaining: info.remainingPerDay,
            },
        });
    }
    async logApiCall(storeId, endpoint, method, statusCode, responseTimeMs, rateLimitInfo, error) {
        await this.prisma.apiLog.create({
            data: {
                storeId,
                endpoint,
                method,
                statusCode,
                responseTimeMs,
                rateLimitRemaining: rateLimitInfo?.remaining,
                rateLimitDayRemaining: rateLimitInfo?.remainingPerDay,
                error,
            },
        });
    }
    async executeWithRetry(storeId, apiKey, endpoint, method, fn) {
        const client = this.buildClient(apiKey);
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            const start = Date.now();
            try {
                const response = await fn(client);
                const responseTimeMs = Date.now() - start;
                const rateInfo = this.extractRateLimitInfo(response.headers);
                await Promise.all([
                    this.logApiCall(storeId, endpoint, method, response.status, responseTimeMs, rateInfo),
                    this.persistRateLimitInfo(storeId, rateInfo),
                ]);
                if (rateInfo.remainingPerDay < 100) {
                    this.logger.warn(`Store ${storeId}: Daily rate limit nearly exhausted (${rateInfo.remainingPerDay} remaining)`);
                }
                return response.data;
            }
            catch (err) {
                const axiosErr = err;
                const responseTimeMs = Date.now() - start;
                const statusCode = axiosErr.response?.status || 0;
                await this.logApiCall(storeId, endpoint, method, statusCode, responseTimeMs, undefined, axiosErr.message);
                if (statusCode === 401) {
                    throw new common_1.UnauthorizedException('Uzum API kaliti noto\'g\'ri — Uzum Seller panel → API sozlamalaridan yangi kalit oling');
                }
                if (statusCode === 403) {
                    const responseData = axiosErr.response?.data;
                    const errorMsg = responseData?.errors?.[0]?.message || responseData?.error || '';
                    const rawBody = typeof responseData === 'string' ? responseData : '';
                    if (errorMsg.includes('Token expired')) {
                        throw new common_1.UnauthorizedException('Uzum API kalitining muddati tugagan. Uzum Seller panelga kirib yangi kalit yarating');
                    }
                    if (errorMsg.includes('Token not found')) {
                        throw new common_1.UnauthorizedException('Uzum API kaliti topilmadi. Uzum Seller panelga → Sozlamalar → API integratsiya bo\'limiga kiring va yangi kalit yarating');
                    }
                    if (rawBody.includes('RBAC') || rawBody.includes('access denied')) {
                        throw new common_1.UnauthorizedException('Uzum API kalitingiz bu endpoint uchun ruxsatga ega emas. Uzum Seller panelda kalit ruxsatlarini kengaytiring');
                    }
                    throw new common_1.UnauthorizedException('Uzum API ruxsat rad etildi — do\'kon ruxsatlarini tekshiring');
                }
                if (statusCode === 429) {
                    const retryAfter = parseInt(axiosErr.response?.headers['retry-after'] || '60', 10);
                    this.logger.warn(`Rate limited on attempt ${attempt}. Waiting ${retryAfter}s`);
                    await this.sleep(retryAfter * 1000);
                    continue;
                }
                lastError = axiosErr;
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    this.logger.warn(`Attempt ${attempt} failed for ${endpoint}. Retrying in ${delay}ms`);
                    await this.sleep(delay);
                }
            }
        }
        const errMsg = lastError?.message || `rate-limited or unreachable for ${endpoint}`;
        throw new common_1.ServiceUnavailableException(`Uzum API unavailable after ${this.maxRetries} attempts: ${errMsg}`);
    }
    async getShops(storeId, apiKey) {
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/shops', 'GET', (client) => client.get('/v1/shops'));
        if (Array.isArray(data))
            return data;
        return data?.payload || [];
    }
    async getProducts(storeId, apiKey, shopId, params = {}) {
        const { page = 0, size = 50, filter = 'ALL', sortBy = 'DEFAULT', order = 'DESC', searchQuery } = params;
        const data = await this.executeWithRetry(storeId, apiKey, `/v1/product/shop/${shopId}`, 'GET', (client) => client.get(`/v1/product/shop/${shopId}`, {
            params: { page, size, filter, sortBy, order, ...(searchQuery ? { searchQuery } : {}) },
        }));
        return {
            products: data?.productList || [],
            total: data?.totalProductsAmount || 0,
        };
    }
    async getAllProducts(storeId, apiKey, shopId) {
        const pageSize = 50;
        const firstPage = await this.getProducts(storeId, apiKey, shopId, { page: 0, size: pageSize });
        if (firstPage.products.length === 0)
            return [];
        const totalPages = Math.ceil(firstPage.total / pageSize);
        const allProducts = [...firstPage.products];
        for (let p = 1; p < totalPages; p++) {
            await this.sleep(200);
            const pageData = await this.getProducts(storeId, apiKey, shopId, { page: p, size: pageSize });
            if (pageData.products.length === 0)
                break;
            allProducts.push(...pageData.products);
        }
        return allProducts;
    }
    async getOrders(storeId, apiKey, shopIds, params = {}) {
        const { page = 0, size = 50, status, scheme, dateFrom, dateTo } = params;
        const queryParams = {
            shopIds,
            page,
            size,
        };
        if (status)
            queryParams.status = status;
        if (scheme)
            queryParams.scheme = scheme;
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        const data = await this.executeWithRetry(storeId, apiKey, '/v2/fbs/orders', 'GET', (client) => client.get('/v2/fbs/orders', { params: queryParams }));
        return data;
    }
    async getAllOrders(storeId, apiKey, shopIds, dateFrom, dateTo) {
        const pageSize = 50;
        const allOrders = [];
        const statuses = [
            'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
            'DELIVERED', 'COMPLETED', 'CANCELED', 'RETURNED',
        ];
        for (const status of statuses) {
            let page = 0;
            let hasMore = true;
            while (hasMore) {
                await this.sleep(150);
                const response = await this.getOrders(storeId, apiKey, shopIds, {
                    page,
                    size: pageSize,
                    status,
                    dateFrom,
                    dateTo,
                });
                if (!response?.payload?.length) {
                    hasMore = false;
                    break;
                }
                allOrders.push(...response.payload);
                hasMore = response.payload.length === pageSize;
                page++;
            }
        }
        return allOrders;
    }
    async getOrderById(storeId, apiKey, orderId) {
        return this.executeWithRetry(storeId, apiKey, `/v1/fbs/order/${orderId}`, 'GET', (client) => client.get(`/v1/fbs/order/${orderId}`));
    }
    async getFinanceOrders(storeId, apiKey, shopIds, params = {}) {
        const { page = 0, size = 50, dateFrom, dateTo, statuses, group } = params;
        const queryParams = { shopIds, page, size };
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        if (statuses?.length)
            queryParams.statuses = statuses;
        if (group !== undefined)
            queryParams.group = group;
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/finance/orders', 'GET', (client) => client.get('/v1/finance/orders', { params: queryParams }));
        return {
            orderItems: data?.orderItems || [],
            total: data?.totalElements || 0,
        };
    }
    async getAllFinanceOrders(storeId, apiKey, shopIds, dateFrom, dateTo) {
        const pageSize = 50;
        const allOrders = [];
        let page = 0;
        while (true) {
            await this.sleep(150);
            const { orderItems } = await this.getFinanceOrders(storeId, apiKey, shopIds, {
                page, size: pageSize, dateFrom, dateTo,
            });
            if (orderItems.length === 0)
                break;
            allOrders.push(...orderItems);
            if (orderItems.length < pageSize)
                break;
            page++;
        }
        return allOrders;
    }
    async getExpenses(storeId, apiKey, shopIds, params = {}) {
        const { page = 0, size = 50, dateFrom, dateTo, sources } = params;
        const queryParams = { shopIds, page, size };
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        if (sources?.length)
            queryParams.sources = sources;
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/finance/expenses', 'GET', (client) => client.get('/v1/finance/expenses', { params: queryParams }));
        return { payments: data?.payload?.payments || [] };
    }
    async getAllExpenses(storeId, apiKey, shopIds, dateFrom, dateTo) {
        const pageSize = 50;
        const all = [];
        let page = 0;
        while (true) {
            await this.sleep(150);
            const { payments } = await this.getExpenses(storeId, apiKey, shopIds, {
                page, size: pageSize, dateFrom, dateTo,
            });
            if (payments.length === 0)
                break;
            all.push(...payments);
            if (payments.length < pageSize)
                break;
            page++;
        }
        return all;
    }
    async getStocks(storeId, apiKey, _shopId, _page = 0, _size = 50) {
        const data = await this.executeWithRetry(storeId, apiKey, '/v2/fbs/sku/stocks', 'GET', (client) => client.get('/v2/fbs/sku/stocks'));
        return { skuAmountList: data?.payload?.skuAmountList || [] };
    }
    async getAllStocks(storeId, apiKey, shopId) {
        const { skuAmountList } = await this.getStocks(storeId, apiKey, shopId);
        return skuAmountList;
    }
    async getFbsOrders(storeId, apiKey, shopId, status = 'PACKING', page = 0, size = 50, extra = {}) {
        const params = { shopIds: shopId, status, page, size };
        if (extra.scheme)
            params.scheme = extra.scheme;
        if (extra.dateFrom)
            params.dateFrom = extra.dateFrom;
        if (extra.dateTo)
            params.dateTo = extra.dateTo;
        const data = await this.executeWithRetry(storeId, apiKey, '/v2/fbs/orders', 'GET', (client) => client.get('/v2/fbs/orders', { params }));
        return {
            orders: data?.payload?.orders || [],
            totalAmount: data?.payload?.totalAmount,
        };
    }
    async getAllFbsOrders(storeId, apiKey, shopId, statuses = ['CREATED', 'PACKING', 'RETURNED']) {
        const all = [];
        for (const status of statuses) {
            let page = 0;
            const pageSize = 50;
            while (true) {
                try {
                    await this.sleep(150);
                    const { orders } = await this.getFbsOrders(storeId, apiKey, shopId, status, page, pageSize);
                    if (orders.length === 0)
                        break;
                    all.push(...orders);
                    if (orders.length < pageSize)
                        break;
                    page++;
                }
                catch (err) {
                    this.logger.warn(`FBS status=${status} page=${page} failed: ${err.message}`);
                    break;
                }
            }
        }
        return all;
    }
    async getFbsOrderCount(storeId, apiKey, shopId, status, dateFrom, dateTo) {
        const client = this.buildClient(apiKey);
        const params = {
            shopIds: shopId,
            status,
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
        };
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await client.get('/v2/fbs/orders/count', { params, timeout: 8_000 });
                return response.data?.payload ?? 0;
            }
            catch (err) {
                const status429 = err?.response?.status === 429;
                if (status429 && attempt === 1) {
                    await this.sleep(2000);
                    continue;
                }
                this.logger.warn(`count failed for status=${status}: ${err?.message}`);
                return 0;
            }
        }
        return 0;
    }
    async confirmFbsOrder(storeId, apiKey, orderId) {
        const client = this.buildClient(apiKey);
        try {
            const response = await client.post(`/v1/fbs/order/${orderId}/confirm`, undefined, { timeout: 10_000 });
            return { ok: true, order: response.data?.payload };
        }
        catch (err) {
            const code = err?.response?.data?.errors?.[0]?.code || err?.response?.status;
            const message = err?.response?.data?.errors?.[0]?.message || err?.message;
            this.logger.warn(`confirmFbsOrder ${orderId} failed: ${code} — ${message}`);
            return { ok: false, error: message };
        }
    }
    async getFbsInvoices(storeId, apiKey, statuses = ['CREATED', 'ACCEPTANCE_IN_PROGRESS', 'ACCEPTED', 'CANCELLED'], page = 0, size = 20) {
        const client = this.buildClient(apiKey);
        const safeSize = Math.min(Math.max(size, 1), 20);
        const qs = [];
        statuses.forEach((s) => qs.push(`statuses=${encodeURIComponent(s)}`));
        qs.push(`page=${page}`);
        qs.push(`size=${safeSize}`);
        const url = `/v1/fbs/invoice?${qs.join('&')}`;
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                const response = await client.get(url, { timeout: 12_000 });
                return { invoices: response.data?.payload || [] };
            }
            catch (err) {
                const code = err?.response?.status;
                const body = err?.response?.data;
                const retryable = code === 429 || code === 503 || code === 400 || code === 502 || code === 504;
                if (retryable && attempt < 4) {
                    this.logger.warn(`getFbsInvoices ${code} — retry ${attempt}/3 in ${attempt * 1000}ms`);
                    await this.sleep(attempt * 1000);
                    continue;
                }
                this.logger.warn(`getFbsInvoices final fail (code=${code}): ${JSON.stringify(body)?.slice(0, 200)}`);
                return { invoices: [] };
            }
        }
        return { invoices: [] };
    }
    async getFbsInvoiceById(storeId, apiKey, invoiceId) {
        const data = await this.executeWithRetry(storeId, apiKey, `/v1/fbs/invoice/${invoiceId}`, 'GET', (client) => client.get(`/v1/fbs/invoice/${invoiceId}`));
        return data?.payload || null;
    }
    async getFbsInvoiceOrders(storeId, apiKey, invoiceId) {
        const data = await this.executeWithRetry(storeId, apiKey, `/v1/fbs/invoice/${invoiceId}/orders`, 'GET', (client) => client.get(`/v1/fbs/invoice/${invoiceId}/orders`));
        return data?.payload || [];
    }
    async getFbsLabelPdf(storeId, apiKey, orderId, size = 'LARGE') {
        const data = await this.executeWithRetry(storeId, apiKey, `/v1/fbs/order/${orderId}/labels/print`, 'GET', (client) => client.get(`/v1/fbs/order/${orderId}/labels/print`, {
            params: { size },
        }));
        return data?.payload?.document || null;
    }
    async getFbsLabelPdfFast(storeId, apiKey, orderId, size = 'LARGE') {
        const client = this.buildClient(apiKey);
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await client.get(`/v1/fbs/order/${orderId}/labels/print`, {
                    params: { size },
                    timeout: 10_000,
                });
                return response.data?.payload?.document || null;
            }
            catch (err) {
                const code = err?.response?.status;
                if (code === 429 && attempt === 1) {
                    await this.sleep(2000);
                    continue;
                }
                this.logger.warn(`label fast fetch failed for ${orderId}: ${err?.message}`);
                return null;
            }
        }
        return null;
    }
    async validateConnection(storeId, apiKey) {
        try {
            const shops = await this.getShops(storeId, apiKey);
            return { valid: true, shops };
        }
        catch (err) {
            this.logger.warn(`Shops validation failed: ${err?.message}. Retrying via FBS endpoint…`);
            throw err;
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.UzumApiClient = UzumApiClient;
exports.UzumApiClient = UzumApiClient = UzumApiClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], UzumApiClient);
//# sourceMappingURL=uzum-api.client.js.map