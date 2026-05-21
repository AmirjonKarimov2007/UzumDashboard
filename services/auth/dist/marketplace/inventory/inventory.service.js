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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let InventoryService = class InventoryService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getInventory(storeId, page = 0, size = 50, status, search) {
        const where = { storeId };
        if (status)
            where.status = status;
        if (search) {
            where.product = { name: { contains: search, mode: 'insensitive' } };
        }
        const [items, total] = await Promise.all([
            this.prisma.inventory.findMany({
                where,
                skip: page * size,
                take: size,
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            imageUrl: true,
                            price: true,
                            category: true,
                            uzumSkuId: true,
                            status: true,
                        },
                    },
                },
                orderBy: [{ status: 'asc' }, { currentStock: 'asc' }],
            }),
            this.prisma.inventory.count({ where }),
        ]);
        return {
            data: items.map((i) => ({
                ...i,
                totalValue: Number(i.product.price) * i.currentStock,
                unitCost: Number(i.product.price),
            })),
            total,
            page,
            size,
            totalPages: Math.ceil(total / size),
        };
    }
    async getInventorySummary(storeId) {
        const [inStock, lowStock, outOfStock, overstock] = await Promise.all([
            this.prisma.inventory.count({ where: { storeId, status: 'IN_STOCK' } }),
            this.prisma.inventory.count({ where: { storeId, status: 'LOW_STOCK' } }),
            this.prisma.inventory.count({ where: { storeId, status: 'OUT_OF_STOCK' } }),
            this.prisma.inventory.count({ where: { storeId, status: 'OVERSTOCK' } }),
        ]);
        const totalValue = await this.prisma.$queryRaw `
      SELECT COALESCE(SUM(i.current_stock * p.price), 0) as total
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.store_id = ${storeId}
        AND p.deleted_at IS NULL
    `;
        return {
            inStock,
            lowStock,
            outOfStock,
            overstock,
            totalValue: Number(totalValue[0]?.total || 0),
        };
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map