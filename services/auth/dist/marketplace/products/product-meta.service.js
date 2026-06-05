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
exports.ProductMetaService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let ProductMetaService = class ProductMetaService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assertOwner(userId, storeId) {
        const store = await this.prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
        if (!store)
            throw new common_1.ForbiddenException('Store not found');
    }
    async getAll(userId, storeId) {
        await this.assertOwner(userId, storeId);
        const rows = await this.prisma.productMeta.findMany({ where: { storeId } });
        const map = {};
        for (const r of rows) {
            map[r.skuId] = {
                costPrice: r.costPrice != null ? Number(r.costPrice) : null,
                articleCode: r.articleCode ?? null,
                xid: r.xid ?? null,
            };
        }
        return { meta: map, count: rows.length };
    }
    async upsert(userId, storeId, skuId, input) {
        await this.assertOwner(userId, storeId);
        const clean = (v) => {
            const s = (v ?? '').trim();
            return s.length ? s : null;
        };
        const costPrice = input.costPrice === null || input.costPrice === undefined || Number.isNaN(Number(input.costPrice))
            ? null
            : Number(input.costPrice);
        const articleCode = clean(input.articleCode);
        const xid = clean(input.xid);
        const productId = clean(input.productId);
        const row = await this.prisma.productMeta.upsert({
            where: { storeId_skuId: { storeId, skuId } },
            create: { storeId, skuId, productId, costPrice, articleCode, xid },
            update: { costPrice, articleCode, xid, ...(productId ? { productId } : {}) },
        });
        return {
            skuId: row.skuId,
            costPrice: row.costPrice != null ? Number(row.costPrice) : null,
            articleCode: row.articleCode ?? null,
            xid: row.xid ?? null,
        };
    }
};
exports.ProductMetaService = ProductMetaService;
exports.ProductMetaService = ProductMetaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductMetaService);
//# sourceMappingURL=product-meta.service.js.map