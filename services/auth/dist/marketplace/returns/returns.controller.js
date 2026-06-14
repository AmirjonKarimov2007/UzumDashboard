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
exports.ReturnsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const returns_service_1 = require("./returns.service");
let ReturnsController = class ReturnsController {
    constructor(returnsService) {
        this.returnsService = returnsService;
    }
    getAnalytics(userId, storeId, dateFrom, dateTo, product, sku, status, force) {
        return this.returnsService.getAnalytics(userId, storeId, {
            dateFrom: dateFrom ? parseInt(dateFrom, 10) : undefined,
            dateTo: dateTo ? parseInt(dateTo, 10) : undefined,
            product: product || undefined,
            sku: sku || undefined,
            status: status || undefined,
            force: force === '1' || force === 'true',
        });
    }
    listInvoices(userId, storeId, page, size) {
        return this.returnsService.listInvoices(userId, storeId, page ? parseInt(page, 10) : 0, size ? parseInt(size, 10) : 20);
    }
    getInvoice(userId, storeId, returnId) {
        return this.returnsService.getInvoice(userId, storeId, returnId);
    }
    sync(userId, storeId) {
        return this.returnsService.syncReturns(userId, storeId).then(() => ({ ok: true }));
    }
};
exports.ReturnsController = ReturnsController;
__decorate([
    (0, common_1.Get)('analytics'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __param(4, (0, common_1.Query)('product')),
    __param(5, (0, common_1.Query)('sku')),
    __param(6, (0, common_1.Query)('status')),
    __param(7, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "getAnalytics", null);
__decorate([
    (0, common_1.Get)('invoices'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "listInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:returnId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('returnId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "sync", null);
exports.ReturnsController = ReturnsController = __decorate([
    (0, common_1.Controller)('marketplace/stores/:storeId/returns'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [returns_service_1.ReturnsService])
], ReturnsController);
//# sourceMappingURL=returns.controller.js.map