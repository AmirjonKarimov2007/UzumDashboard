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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let OrdersService = class OrdersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOrders(query) {
        const { storeId, page = 0, size = 50, search, status, dateFrom, dateTo } = query;
        const where = { storeId };
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { uzumOrderId: { contains: search } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerPhone: { contains: search } },
            ];
        }
        if (dateFrom || dateTo) {
            where.orderedAt = {};
            if (dateFrom)
                where.orderedAt.gte = new Date(dateFrom);
            if (dateTo)
                where.orderedAt.lte = new Date(dateTo);
        }
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                skip: page * size,
                take: size,
                orderBy: { orderedAt: 'desc' },
                include: {
                    items: {
                        include: { product: { select: { name: true, imageUrl: true } } },
                    },
                },
            }),
            this.prisma.order.count({ where }),
        ]);
        return {
            data: orders,
            total,
            page,
            size,
            totalPages: Math.ceil(total / size),
        };
    }
    async getOrder(storeId, orderId) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, storeId },
            include: {
                items: {
                    include: { product: { select: { name: true, imageUrl: true, price: true } } },
                },
            },
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        return order;
    }
    async getOrderSummary(storeId) {
        const [total, statusCounts, financials] = await Promise.all([
            this.prisma.order.count({ where: { storeId } }),
            this.prisma.order.groupBy({
                by: ['status'],
                where: { storeId },
                _count: { id: true },
            }),
            this.prisma.order.aggregate({
                where: { storeId, status: { notIn: ['CANCELED', 'RETURNED'] } },
                _sum: { total: true, profit: true, commission: true },
            }),
        ]);
        const statusMap = {};
        statusCounts.forEach((s) => (statusMap[s.status] = s._count.id));
        return {
            total,
            completed: statusMap['COMPLETED'] || 0,
            delivering: (statusMap['DELIVERING'] || 0) + (statusMap['PENDING_DELIVERY'] || 0),
            canceled: statusMap['CANCELED'] || 0,
            returned: statusMap['RETURNED'] || 0,
            totalRevenue: Number(financials._sum.total || 0),
            totalProfit: Number(financials._sum.profit || 0),
            totalCommission: Number(financials._sum.commission || 0),
        };
    }
    async getRecentOrders(storeId, limit = 10) {
        return this.prisma.order.findMany({
            where: { storeId },
            orderBy: { orderedAt: 'desc' },
            take: limit,
            include: {
                items: { select: { name: true, quantity: true, price: true } },
            },
        });
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map