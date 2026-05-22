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
exports.FbsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const fbs_service_1 = require("./fbs.service");
class BatchLabelsDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], BatchLabelsDto.prototype, "orderIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['LARGE', 'SMALL']),
    __metadata("design:type", String)
], BatchLabelsDto.prototype, "size", void 0);
let FbsController = class FbsController {
    constructor(fbsService) {
        this.fbsService = fbsService;
    }
    getOrders(userId, storeId, status, page, size, scheme, dateFrom, dateTo) {
        return this.fbsService.getOrders(userId, storeId, status, page, size, {
            scheme,
            dateFrom: dateFrom ? parseInt(dateFrom, 10) : undefined,
            dateTo: dateTo ? parseInt(dateTo, 10) : undefined,
        });
    }
    getOrderCounts(userId, storeId, dateFrom, dateTo) {
        return this.fbsService.getOrderCounts(userId, storeId, dateFrom ? parseInt(dateFrom, 10) : undefined, dateTo ? parseInt(dateTo, 10) : undefined);
    }
    getAllOrders(userId, storeId, statusesParam) {
        const statuses = statusesParam ? statusesParam.split(',') : undefined;
        return this.fbsService.getAllOrders(userId, storeId, statuses);
    }
    getLiveProducts(userId, storeId, page, size, filter, searchQuery, sortBy, order) {
        return this.fbsService.getLiveProducts(userId, storeId, page, size, filter, searchQuery, sortBy, order);
    }
    getLiveFinanceOrders(userId, storeId, page, size, dateFrom, dateTo) {
        return this.fbsService.getLiveFinanceOrders(userId, storeId, page, size, dateFrom ? parseInt(dateFrom, 10) : undefined, dateTo ? parseInt(dateTo, 10) : undefined);
    }
    getLiveStocks(userId, storeId) {
        return this.fbsService.getLiveStocks(userId, storeId);
    }
    async getLabel(userId, storeId, orderId, size, res) {
        const buffer = await this.fbsService.getLabelPdf(userId, storeId, orderId, size);
        if (!buffer) {
            throw new common_1.NotFoundException(`Label PDF for order ${orderId} mavjud emas`);
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label_${orderId}.pdf"`);
        res.send(buffer);
    }
    getBatchLabels(userId, storeId, dto) {
        return this.fbsService.getBatchLabelsPdf(userId, storeId, dto.orderIds, dto.size || 'LARGE');
    }
};
exports.FbsController = FbsController;
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('status', new common_1.DefaultValuePipe('PACKING'))),
    __param(3, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('size', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __param(5, (0, common_1.Query)('scheme')),
    __param(6, (0, common_1.Query)('dateFrom')),
    __param(7, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number, String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('orders/counts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getOrderCounts", null);
__decorate([
    (0, common_1.Get)('orders/all'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('statuses')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getAllOrders", null);
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('size', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('filter')),
    __param(5, (0, common_1.Query)('search')),
    __param(6, (0, common_1.Query)('sortBy')),
    __param(7, (0, common_1.Query)('order')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String, String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getLiveProducts", null);
__decorate([
    (0, common_1.Get)('finance/orders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('size', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('dateFrom')),
    __param(5, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getLiveFinanceOrders", null);
__decorate([
    (0, common_1.Get)('stocks'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getLiveStocks", null);
__decorate([
    (0, common_1.Get)('orders/:orderId/label'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __param(3, (0, common_1.Query)('size', new common_1.DefaultValuePipe('LARGE'))),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], FbsController.prototype, "getLabel", null);
__decorate([
    (0, common_1.Post)('labels/batch'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, BatchLabelsDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getBatchLabels", null);
exports.FbsController = FbsController = __decorate([
    (0, common_1.Controller)('marketplace/stores/:storeId/fbs'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [fbs_service_1.FbsService])
], FbsController);
//# sourceMappingURL=fbs.controller.js.map