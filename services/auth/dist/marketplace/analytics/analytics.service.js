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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const date_fns_1 = require("date-fns");
let AnalyticsService = class AnalyticsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getDashboardMetrics(storeId, timeRange = 'month') {
        const { from, to, prevFrom, prevTo } = this.getDateRange(timeRange);
        const [current, previous] = await Promise.all([
            this.getMetricsForPeriod(storeId, from, to),
            this.getMetricsForPeriod(storeId, prevFrom, prevTo),
        ]);
        const calcChange = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;
        return {
            revenue: {
                value: current.revenue,
                change: calcChange(current.revenue, previous.revenue),
                sparkline: await this.getSparkline(storeId, from, to, 'revenue'),
            },
            orders: {
                value: current.orders,
                change: calcChange(current.orders, previous.orders),
                sparkline: await this.getSparkline(storeId, from, to, 'orders'),
            },
            profit: {
                value: current.profit,
                change: calcChange(current.profit, previous.profit),
                sparkline: await this.getSparkline(storeId, from, to, 'profit'),
            },
            margin: {
                value: current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0,
                change: calcChange(current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0, previous.revenue > 0 ? (previous.profit / previous.revenue) * 100 : 0),
                sparkline: [],
            },
        };
    }
    async getRevenueChart(storeId, timeRange = 'month') {
        const { from, to } = this.getDateRange(timeRange);
        const snapshots = await this.prisma.analyticsSnapshot.findMany({
            where: { storeId, date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
        });
        return snapshots.map((s) => ({
            name: (0, date_fns_1.format)(s.date, 'MMM d'),
            revenue: Number(s.revenue),
            profit: Number(s.profit),
            orders: s.orders,
        }));
    }
    async getCategoryBreakdown(storeId) {
        const products = await this.prisma.product.groupBy({
            by: ['category'],
            where: { storeId, deletedAt: null },
            _sum: { revenue: true },
            _count: { id: true },
        });
        const totalRevenue = products.reduce((sum, p) => sum + Number(p._sum.revenue || 0), 0);
        return products
            .filter((p) => p.category)
            .sort((a, b) => Number(b._sum.revenue || 0) - Number(a._sum.revenue || 0))
            .map((p) => ({
            name: p.category,
            value: Number(p._sum.revenue || 0),
            count: p._count.id,
            percentage: totalRevenue > 0 ? (Number(p._sum.revenue || 0) / totalRevenue) * 100 : 0,
        }));
    }
    async getFinanceSummary(storeId, timeRange = 'month') {
        const { from, to } = this.getDateRange(timeRange);
        const [ordersAgg, expensesAgg, returnsAgg] = await Promise.all([
            this.prisma.order.aggregate({
                where: {
                    storeId,
                    orderedAt: { gte: from, lte: to },
                    status: { notIn: ['CANCELED', 'RETURNED'] },
                },
                _sum: { total: true, commission: true, deliveryFee: true, profit: true },
            }),
            this.prisma.expense.aggregate({
                where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
                _sum: { amount: true },
            }),
            this.prisma.order.aggregate({
                where: { storeId, orderedAt: { gte: from, lte: to }, status: 'RETURNED' },
                _sum: { total: true },
                _count: { id: true },
            }),
        ]);
        const revenue = Number(ordersAgg._sum.total || 0);
        const commission = Number(ordersAgg._sum.commission || 0);
        const expenses = Number(expensesAgg._sum.amount || 0);
        const returnLoss = Number(returnsAgg._sum.total || 0);
        const profit = revenue - commission - expenses - returnLoss;
        return {
            revenue,
            commission,
            expenses,
            returnLoss,
            profit,
            margin: revenue > 0 ? (profit / revenue) * 100 : 0,
            netRevenue: revenue - returnLoss,
            roi: expenses > 0 ? (profit / expenses) * 100 : 0,
        };
    }
    async getExpenseBreakdown(storeId, timeRange = 'month') {
        const { from, to } = this.getDateRange(timeRange);
        return this.prisma.expense.groupBy({
            by: ['category'],
            where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
            _sum: { amount: true },
            _count: { id: true },
        });
    }
    async getTransactions(storeId, page = 0, size = 20, dateFrom, dateTo) {
        const where = { storeId };
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
                select: {
                    id: true,
                    uzumOrderId: true,
                    status: true,
                    total: true,
                    commission: true,
                    profit: true,
                    orderedAt: true,
                    items: { select: { name: true }, take: 1 },
                },
            }),
            this.prisma.order.count({ where }),
        ]);
        return { data: orders, total, page, size, totalPages: Math.ceil(total / size) };
    }
    async getMetricsForPeriod(storeId, from, to) {
        const agg = await this.prisma.analyticsSnapshot.aggregate({
            where: { storeId, date: { gte: from, lte: to } },
            _sum: { revenue: true, profit: true, orders: true, commission: true },
        });
        return {
            revenue: Number(agg._sum.revenue || 0),
            profit: Number(agg._sum.profit || 0),
            orders: Number(agg._sum.orders || 0),
            commission: Number(agg._sum.commission || 0),
        };
    }
    async getSparkline(storeId, from, to, field) {
        const snapshots = await this.prisma.analyticsSnapshot.findMany({
            where: { storeId, date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
            select: { revenue: true, orders: true, profit: true },
            take: 12,
        });
        return snapshots.map((s) => Number(s[field] || 0));
    }
    getDateRange(timeRange) {
        const to = (0, date_fns_1.endOfDay)(new Date());
        let from;
        let prevFrom;
        let prevTo;
        switch (timeRange) {
            case 'today':
                from = (0, date_fns_1.startOfDay)(new Date());
                prevFrom = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(new Date(), 1));
                prevTo = (0, date_fns_1.endOfDay)((0, date_fns_1.subDays)(new Date(), 1));
                break;
            case 'week':
                from = (0, date_fns_1.subDays)(new Date(), 7);
                prevFrom = (0, date_fns_1.subDays)(new Date(), 14);
                prevTo = (0, date_fns_1.subDays)(new Date(), 7);
                break;
            case 'quarter':
                from = (0, date_fns_1.subMonths)(new Date(), 3);
                prevFrom = (0, date_fns_1.subMonths)(new Date(), 6);
                prevTo = (0, date_fns_1.subMonths)(new Date(), 3);
                break;
            case 'year':
                from = (0, date_fns_1.subMonths)(new Date(), 12);
                prevFrom = (0, date_fns_1.subMonths)(new Date(), 24);
                prevTo = (0, date_fns_1.subMonths)(new Date(), 12);
                break;
            default:
                from = (0, date_fns_1.subMonths)(new Date(), 1);
                prevFrom = (0, date_fns_1.subMonths)(new Date(), 2);
                prevTo = (0, date_fns_1.subMonths)(new Date(), 1);
        }
        return { from, to, prevFrom, prevTo };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map