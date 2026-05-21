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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const analytics_service_1 = require("../analytics/analytics.service");
const prisma_service_1 = require("../../common/database/prisma.service");
let FinanceController = class FinanceController {
    constructor(analyticsService, prisma) {
        this.analyticsService = analyticsService;
        this.prisma = prisma;
    }
    getFinanceSummary(storeId, timeRange = 'month') {
        return this.analyticsService.getFinanceSummary(storeId, timeRange);
    }
    getExpenseBreakdown(storeId, timeRange = 'month') {
        return this.analyticsService.getExpenseBreakdown(storeId, timeRange);
    }
    getTransactions(storeId, page, size, dateFrom, dateTo) {
        return this.analyticsService.getTransactions(storeId, page, size, dateFrom, dateTo);
    }
    getCashflow(storeId, timeRange = 'month') {
        return this.getCashflowData(storeId, timeRange);
    }
    getCommissionAnalysis(storeId, timeRange = 'month') {
        return this.getCommissionData(storeId, timeRange);
    }
    getRoiAnalysis(storeId, timeRange = 'month') {
        return this.getRoiData(storeId, timeRange);
    }
    async getCashflowData(storeId, timeRange) {
        const { from, to } = this.getDateRange(timeRange);
        const orders = await this.prisma.order.aggregate({
            where: {
                storeId,
                orderedAt: { gte: from, lte: to },
                status: { notIn: ['CANCELED', 'RETURNED'] },
            },
            _sum: { total: true, profit: true },
            _count: { id: true },
        });
        const expenses = await this.prisma.expense.aggregate({
            where: { storeId, date: { gte: from, lte: to }, deletedAt: null },
            _sum: { amount: true },
            _count: { id: true },
        });
        const returns = await this.prisma.order.aggregate({
            where: {
                storeId,
                orderedAt: { gte: from, lte: to },
                status: 'RETURNED',
            },
            _sum: { total: true },
            _count: { id: true },
        });
        const snapshots = await this.prisma.analyticsSnapshot.findMany({
            where: { storeId, date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
        });
        const chartData = snapshots.map((s) => ({
            date: s.date.toISOString().split('T')[0],
            revenue: Number(s.revenue),
            profit: Number(s.profit),
            expenses: Number(s.revenue) - Number(s.profit) - Number(s.commission),
        }));
        return {
            revenue: Number(orders._sum.total || 0),
            profit: Number(orders._sum.profit || 0),
            expenses: Number(expenses._sum.amount || 0),
            returns: Number(returns._sum.total || 0),
            orders: orders._count.id,
            chartData,
        };
    }
    async getCommissionData(storeId, timeRange) {
        const { from, to } = this.getDateRange(timeRange);
        const orders = await this.prisma.order.aggregate({
            where: {
                storeId,
                orderedAt: { gte: from, lte: to },
                status: { notIn: ['CANCELED', 'RETURNED'] },
            },
            _sum: { total: true, commission: true, deliveryFee: true },
        });
        const revenue = Number(orders._sum.total || 0);
        const commission = Number(orders._sum.commission || 0);
        const deliveryFee = Number(orders._sum.deliveryFee || 0);
        const paymentFee = revenue * 0.015;
        return {
            baseCommission: commission,
            deliveryFee,
            paymentFee,
            totalCommission: commission + deliveryFee + paymentFee,
            commissionRate: revenue > 0 ? (commission / revenue) * 100 : 0,
        };
    }
    async getRoiData(storeId, timeRange) {
        const { from, to } = this.getDateRange(timeRange);
        const finance = await this.analyticsService.getFinanceSummary(storeId, timeRange);
        const avgOrderValue = await this.prisma.order.aggregate({
            where: {
                storeId,
                orderedAt: { gte: from, lte: to },
                status: { notIn: ['CANCELED', 'RETURNED'] },
            },
            _sum: { total: true, profit: true },
            _count: { id: true },
        });
        const ordersCount = avgOrderValue._count.id;
        const avgProfitPerOrder = ordersCount > 0
            ? Number(avgOrderValue._sum.profit || 0) / ordersCount
            : 0;
        return {
            roi: finance.roi,
            netProfit: finance.profit,
            totalInvestment: finance.expenses,
            margin: finance.margin,
            ordersCount,
            avgProfitPerOrder,
        };
    }
    getDateRange(timeRange) {
        const to = new Date();
        let from;
        switch (timeRange) {
            case 'today':
                from = new Date(to);
                from.setHours(0, 0, 0, 0);
                break;
            case 'week':
                from = new Date(to);
                from.setDate(from.getDate() - 7);
                break;
            case 'quarter':
                from = new Date(to);
                from.setMonth(from.getMonth() - 3);
                break;
            case 'year':
                from = new Date(to);
                from.setFullYear(from.getFullYear() - 1);
                break;
            default:
                from = new Date(to);
                from.setMonth(from.getMonth() - 1);
        }
        return { from, to };
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Get)('summary'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getFinanceSummary", null);
__decorate([
    (0, common_1.Get)('expenses'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getExpenseBreakdown", null);
__decorate([
    (0, common_1.Get)('transactions'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('size', new common_1.DefaultValuePipe(20), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('dateFrom')),
    __param(4, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getTransactions", null);
__decorate([
    (0, common_1.Get)('cashflow'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getCashflow", null);
__decorate([
    (0, common_1.Get)('commission'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getCommissionAnalysis", null);
__decorate([
    (0, common_1.Get)('roi'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getRoiAnalysis", null);
exports.FinanceController = FinanceController = __decorate([
    (0, common_1.Controller)('marketplace/stores/:storeId/finance'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService,
        prisma_service_1.PrismaService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map