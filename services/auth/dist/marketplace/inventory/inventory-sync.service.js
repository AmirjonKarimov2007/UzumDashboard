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
var InventorySyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventorySyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const date_fns_1 = require("date-fns");
let InventorySyncService = InventorySyncService_1 = class InventorySyncService {
    constructor(prisma, uzumClient) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.logger = new common_1.Logger(InventorySyncService_1.name);
    }
    async syncInventory(storeId, uzumShopId, apiKey) {
        this.logger.log(`Syncing inventory for store ${storeId}`);
        const stocks = await this.uzumClient.getAllStocks(storeId, apiKey, uzumShopId);
        if (!stocks.length) {
            await this.updateInventoryComputedFields(storeId);
            return 0;
        }
        let synced = 0;
        for (const s of stocks) {
            const product = await this.prisma.product.findFirst({
                where: { storeId, uzumSkuId: String(s.skuId) },
            });
            if (!product)
                continue;
            const currentStock = s.stocks || 0;
            const reservedStock = s.reserved || 0;
            const soldLast30Days = await this.getSoldLast30Days(product.id);
            const daysUntilStockout = soldLast30Days > 0
                ? Math.floor((currentStock / soldLast30Days) * 30)
                : null;
            const status = this.computeInventoryStatus(currentStock, soldLast30Days);
            await this.prisma.inventory.upsert({
                where: { productId: product.id },
                create: {
                    productId: product.id,
                    storeId,
                    currentStock,
                    reservedStock,
                    soldLast30Days,
                    daysUntilStockout,
                    status,
                },
                update: {
                    currentStock,
                    reservedStock,
                    soldLast30Days,
                    daysUntilStockout,
                    status,
                },
            });
            await this.prisma.product.update({
                where: { id: product.id },
                data: { stock: currentStock },
            });
            synced++;
        }
        await this.updateInventoryComputedFields(storeId);
        this.logger.log(`Synced ${synced} inventory records for store ${storeId}`);
        return synced;
    }
    async updateInventoryComputedFields(storeId) {
        const products = await this.prisma.product.findMany({
            where: { storeId, deletedAt: null, inventory: null },
        });
        for (const p of products) {
            const soldLast30Days = await this.getSoldLast30Days(p.id);
            const daysUntilStockout = soldLast30Days > 0
                ? Math.floor((p.stock / soldLast30Days) * 30)
                : null;
            const status = this.computeInventoryStatus(p.stock, soldLast30Days);
            await this.prisma.inventory.create({
                data: {
                    productId: p.id,
                    storeId,
                    currentStock: p.stock,
                    reservedStock: 0,
                    soldLast30Days,
                    daysUntilStockout,
                    status,
                },
            });
        }
    }
    async getSoldLast30Days(productId) {
        const thirtyDaysAgo = (0, date_fns_1.subDays)(new Date(), 30);
        const result = await this.prisma.orderItem.aggregate({
            where: {
                productId,
                order: {
                    orderedAt: { gte: thirtyDaysAgo },
                    status: { notIn: ['CANCELED', 'RETURNED'] },
                },
            },
            _sum: { quantity: true },
        });
        return result._sum.quantity || 0;
    }
    computeInventoryStatus(stock, soldLast30Days) {
        if (stock === 0)
            return 'OUT_OF_STOCK';
        if (soldLast30Days > 0 && stock < soldLast30Days * 0.3)
            return 'LOW_STOCK';
        if (soldLast30Days > 0 && stock > soldLast30Days * 6)
            return 'OVERSTOCK';
        return 'IN_STOCK';
    }
};
exports.InventorySyncService = InventorySyncService;
exports.InventorySyncService = InventorySyncService = InventorySyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient])
], InventorySyncService);
//# sourceMappingURL=inventory-sync.service.js.map