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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let ProductsService = class ProductsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProducts(query) {
        const { storeId, page = 0, size = 50, search, status, category, sortBy = 'revenue', order = 'desc' } = query;
        const where = { storeId, deletedAt: null };
        if (search)
            where.name = { contains: search, mode: 'insensitive' };
        if (status)
            where.status = status;
        if (category)
            where.category = { contains: category, mode: 'insensitive' };
        const orderBy = {};
        const sortableFields = ['name', 'price', 'stock', 'soldCount', 'revenue', 'profit', 'margin', 'rating'];
        orderBy[sortableFields.includes(sortBy) ? sortBy : 'revenue'] = order;
        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                skip: page * size,
                take: size,
                orderBy,
                include: { inventory: true },
            }),
            this.prisma.product.count({ where }),
        ]);
        return {
            data: products,
            total,
            page,
            size,
            totalPages: Math.ceil(total / size),
        };
    }
    async getProduct(storeId, productId) {
        const product = await this.prisma.product.findFirst({
            where: { id: productId, storeId, deletedAt: null },
            include: {
                inventory: true,
                metrics: {
                    orderBy: { date: 'desc' },
                    take: 30,
                },
            },
        });
        if (!product)
            throw new common_1.NotFoundException('Product not found');
        return product;
    }
    async getProductSummary(storeId) {
        const [total, active, lowStock, outOfStock] = await Promise.all([
            this.prisma.product.count({ where: { storeId, deletedAt: null } }),
            this.prisma.product.count({ where: { storeId, status: 'ACTIVE', deletedAt: null } }),
            this.prisma.inventory.count({ where: { storeId, status: 'LOW_STOCK' } }),
            this.prisma.inventory.count({ where: { storeId, status: 'OUT_OF_STOCK' } }),
        ]);
        const revenue = await this.prisma.product.aggregate({
            where: { storeId, deletedAt: null },
            _sum: { revenue: true, profit: true, soldCount: true },
        });
        return {
            total,
            active,
            lowStock,
            outOfStock,
            totalRevenue: Number(revenue._sum.revenue || 0),
            totalProfit: Number(revenue._sum.profit || 0),
            totalSold: Number(revenue._sum.soldCount || 0),
        };
    }
    async getTopProducts(storeId, limit = 10) {
        return this.prisma.product.findMany({
            where: { storeId, deletedAt: null },
            orderBy: { revenue: 'desc' },
            take: limit,
            select: {
                id: true,
                name: true,
                imageUrl: true,
                revenue: true,
                soldCount: true,
                margin: true,
                status: true,
            },
        });
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map