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
var ProductsSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
let ProductsSyncService = ProductsSyncService_1 = class ProductsSyncService {
    constructor(prisma, uzumClient) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.logger = new common_1.Logger(ProductsSyncService_1.name);
    }
    async syncProducts(storeId, uzumShopId, apiKey) {
        this.logger.log(`Syncing products for store ${storeId}`);
        const uzumProducts = await this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId);
        if (!uzumProducts.length) {
            this.logger.log(`No products returned for store ${storeId}`);
            return 0;
        }
        let synced = 0;
        for (const p of uzumProducts) {
            const price = (p.sellPrice || p.fullPrice || 0) / 100;
            const purchasePrice = p.purchasePrice ? p.purchasePrice / 100 : null;
            const revenue = (p.revenue || 0) / 100;
            const margin = price > 0 && purchasePrice
                ? ((price - purchasePrice) / price) * 100
                : 0;
            const profit = purchasePrice
                ? (price - purchasePrice) * (p.ordersAmount || 0)
                : 0;
            await this.prisma.product.upsert({
                where: { storeId_uzumSkuId: { storeId, uzumSkuId: String(p.skuId) } },
                create: {
                    storeId,
                    uzumSkuId: String(p.skuId),
                    uzumProductId: p.productId ? String(p.productId) : null,
                    name: p.name || 'Unknown Product',
                    category: p.categoryTitle || null,
                    price,
                    purchasePrice,
                    stock: p.stocks || 0,
                    soldCount: p.ordersAmount || 0,
                    revenue,
                    profit,
                    margin,
                    rating: p.rating || null,
                    reviewCount: p.reviewsAmount || 0,
                    viewCount: p.viewsAmount || 0,
                    status: this.mapProductStatus(p.status),
                    rank: p.productRank || null,
                    imageUrl: p.imageUrls?.[0] || null,
                },
                update: {
                    name: p.name || 'Unknown Product',
                    category: p.categoryTitle || null,
                    price,
                    purchasePrice,
                    stock: p.stocks || 0,
                    soldCount: p.ordersAmount || 0,
                    revenue,
                    profit,
                    margin,
                    rating: p.rating || null,
                    reviewCount: p.reviewsAmount || 0,
                    viewCount: p.viewsAmount || 0,
                    status: this.mapProductStatus(p.status),
                    rank: p.productRank || null,
                    imageUrl: p.imageUrls?.[0] || null,
                    deletedAt: null,
                },
            });
            synced++;
        }
        this.logger.log(`Synced ${synced} products for store ${storeId}`);
        return synced;
    }
    mapProductStatus(status) {
        const map = {
            ACTIVE: 'ACTIVE',
            INACTIVE: 'INACTIVE',
            WARNING: 'WARNING',
            ARCHIVE: 'ARCHIVE',
            DEFECTED: 'DEFECTED',
        };
        return map[status?.toUpperCase()] || 'ACTIVE';
    }
};
exports.ProductsSyncService = ProductsSyncService;
exports.ProductsSyncService = ProductsSyncService = ProductsSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient])
], ProductsSyncService);
//# sourceMappingURL=products-sync.service.js.map