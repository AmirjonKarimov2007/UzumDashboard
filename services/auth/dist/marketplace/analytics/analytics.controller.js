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
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const analytics_service_1 = require("./analytics.service");
let AnalyticsController = class AnalyticsController {
    constructor(analyticsService) {
        this.analyticsService = analyticsService;
    }
    getDashboard(storeId, timeRange = 'month') {
        return this.analyticsService.getDashboardMetrics(storeId, timeRange);
    }
    getRevenueChart(storeId, timeRange = 'month') {
        return this.analyticsService.getRevenueChart(storeId, timeRange);
    }
    getCategoryBreakdown(storeId) {
        return this.analyticsService.getCategoryBreakdown(storeId);
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
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('dashboard'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('revenue-chart'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getRevenueChart", null);
__decorate([
    (0, common_1.Get)('categories'),
    __param(0, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getCategoryBreakdown", null);
__decorate([
    (0, common_1.Get)('finance'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getFinanceSummary", null);
__decorate([
    (0, common_1.Get)('expenses'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('timeRange')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getExpenseBreakdown", null);
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
], AnalyticsController.prototype, "getTransactions", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, common_1.Controller)('marketplace/stores/:storeId/analytics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map