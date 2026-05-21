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
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept-Language': 'ru',
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
                    const errorCode = responseData?.errors?.[0]?.code;
                    const errorMsg = responseData?.errors?.[0]?.message || '';
                    const rawBody = typeof responseData === 'string' ? responseData : '';
                    if (errorCode === 'forbidden-001' || errorMsg.includes('Token not found')) {
                        throw new common_1.UnauthorizedException('Uzum API kaliti topilmadi. Uzum Seller panelga → Sozlamalar → API integratsiya bo\'limiga kiring va yangi kalit yarating');
                    }
                    if (rawBody.includes('RBAC') || rawBody.includes('access denied')) {
                        throw new common_1.UnauthorizedException('Uzum API kalitingiz kerakli ruxsatlarga ega emas. Kalit "mahsulotlar", "buyurtmalar" va "moliya" ruxsatlarini o\'z ichiga olishi kerak');
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
        throw new common_1.ServiceUnavailableException(`Uzum API unavailable after ${this.maxRetries} attempts: ${lastError.message}`);
    }
    async getShops(storeId, apiKey) {
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/shops', 'GET', (client) => client.get('/v1/shops'));
        return data.payload || [];
    }
    async getProducts(storeId, apiKey, shopId, params = {}) {
        const { page = 0, size = 50, filter = 'ALL', sortBy = 'DEFAULT', order = 'DESC' } = params;
        const data = await this.executeWithRetry(storeId, apiKey, `/v1/product/shop/${shopId}`, 'GET', (client) => client.get(`/v1/product/shop/${shopId}`, {
            params: { page, size, filter, sortBy, order },
        }));
        return data;
    }
    async getAllProducts(storeId, apiKey, shopId) {
        const pageSize = 50;
        const firstPage = await this.getProducts(storeId, apiKey, shopId, { page: 0, size: pageSize });
        if (!firstPage || !firstPage.payload)
            return [];
        const totalPages = Math.ceil((firstPage.total || firstPage.payload.length) / pageSize);
        const allProducts = [...firstPage.payload];
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
        for (const page of remainingPages) {
            await this.sleep(200);
            const pageData = await this.getProducts(storeId, apiKey, shopId, { page, size: pageSize });
            if (pageData?.payload)
                allProducts.push(...pageData.payload);
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
        const { page = 0, size = 50, dateFrom, dateTo, statuses } = params;
        const queryParams = { shopIds, page, size };
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        if (statuses?.length)
            queryParams.statuses = statuses;
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/finance/orders', 'GET', (client) => client.get('/v1/finance/orders', { params: queryParams }));
        return data;
    }
    async getAllFinanceOrders(storeId, apiKey, shopIds, dateFrom, dateTo) {
        const pageSize = 50;
        const allOrders = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
            await this.sleep(150);
            const response = await this.getFinanceOrders(storeId, apiKey, shopIds, {
                page,
                size: pageSize,
                dateFrom,
                dateTo,
            });
            if (!response?.payload?.length)
                break;
            allOrders.push(...response.payload);
            hasMore = response.payload.length === pageSize;
            page++;
        }
        return allOrders;
    }
    async getExpenses(storeId, apiKey, shopIds, params = {}) {
        const { page = 0, size = 50, dateFrom, dateTo } = params;
        const queryParams = { shopIds, page, size };
        if (dateFrom)
            queryParams.dateFrom = dateFrom;
        if (dateTo)
            queryParams.dateTo = dateTo;
        const data = await this.executeWithRetry(storeId, apiKey, '/v1/finance/expenses', 'GET', (client) => client.get('/v1/finance/expenses', { params: queryParams }));
        return data;
    }
    async getAllExpenses(storeId, apiKey, shopIds, dateFrom, dateTo) {
        const pageSize = 50;
        const allExpenses = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
            await this.sleep(150);
            const response = await this.getExpenses(storeId, apiKey, shopIds, {
                page,
                size: pageSize,
                dateFrom,
                dateTo,
            });
            if (!response?.payload?.length)
                break;
            allExpenses.push(...response.payload);
            hasMore = response.payload.length === pageSize;
            page++;
        }
        return allExpenses;
    }
    async getStocks(storeId, apiKey, shopId, page = 0, size = 50) {
        const data = await this.executeWithRetry(storeId, apiKey, '/v2/fbs/sku/stocks', 'GET', (client) => client.get('/v2/fbs/sku/stocks', {
            params: { shopId, page, size },
        }));
        return data;
    }
    async getAllStocks(storeId, apiKey, shopId) {
        const pageSize = 50;
        const allStocks = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
            await this.sleep(150);
            const response = await this.getStocks(storeId, apiKey, shopId, page, pageSize);
            if (!response?.payload?.length)
                break;
            allStocks.push(...response.payload);
            hasMore = response.payload.length === pageSize;
            page++;
        }
        return allStocks;
    }
    async validateConnection(storeId, apiKey) {
        const shops = await this.getShops(storeId, apiKey);
        return { valid: true, shops };
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