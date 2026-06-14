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
const class_transformer_1 = require("class-transformer");
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
class StockUpdateItem {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], StockUpdateItem.prototype, "skuId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], StockUpdateItem.prototype, "amount", void 0);
class SetStocksDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => StockUpdateItem),
    __metadata("design:type", Array)
], SetStocksDto.prototype, "updates", void 0);
class CancelOrderDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CancelOrderDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CancelOrderDto.prototype, "comment", void 0);
class IdentifierItem {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], IdentifierItem.prototype, "orderItemId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], IdentifierItem.prototype, "values", void 0);
class SetIdentifiersDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => IdentifierItem),
    __metadata("design:type", Array)
], SetIdentifiersDto.prototype, "items", void 0);
class PriceSkuItem {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PriceSkuItem.prototype, "skuId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PriceSkuItem.prototype, "fullPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PriceSkuItem.prototype, "sellPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PriceSkuItem.prototype, "skuTitle", void 0);
class UpdatePricesDto {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdatePricesDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PriceSkuItem),
    __metadata("design:type", Array)
], UpdatePricesDto.prototype, "skuList", void 0);
class CreateInvoiceDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], CreateInvoiceDto.prototype, "orderIds", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInvoiceDto.prototype, "dropOffPointUuid", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInvoiceDto.prototype, "timeSlotUuid", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateInvoiceDto.prototype, "sellerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInvoiceDto.prototype, "idempotencyKey", void 0);
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
    confirmOrder(userId, storeId, orderId) {
        return this.fbsService.confirmOrder(userId, storeId, orderId);
    }
    cancelOrder(userId, storeId, orderId, dto) {
        return this.fbsService.cancelOrder(userId, storeId, orderId, dto.reason, dto.comment);
    }
    setIdentifiers(userId, storeId, orderId, dto) {
        return this.fbsService.setOrderIdentifiers(userId, storeId, orderId, dto.items);
    }
    getReturnReasons(userId, storeId) {
        return this.fbsService.getReturnReasons(userId, storeId);
    }
    dbsDelivering(userId, storeId, orderId) {
        return this.fbsService.dbsDelivering(userId, storeId, orderId);
    }
    dbsCompleted(userId, storeId, orderId, issueCode) {
        return this.fbsService.dbsCompleted(userId, storeId, orderId, issueCode ? parseInt(issueCode, 10) : undefined);
    }
    dbsRefund(userId, storeId, orderId) {
        return this.fbsService.dbsRefund(userId, storeId, orderId);
    }
    updatePrices(userId, storeId, dto) {
        return this.fbsService.updatePrices(userId, storeId, dto.productId, dto.skuList);
    }
    getReturns(userId, storeId, page, size, returnId) {
        return this.fbsService.getReturns(userId, storeId, { page, size, returnId });
    }
    getSupplyInvoices(userId, storeId, page, size) {
        return this.fbsService.getSupplyInvoices(userId, storeId, page, size);
    }
    getInvoices(userId, storeId, statusesParam, page, size) {
        const statuses = statusesParam ? statusesParam.split(',') : undefined;
        return this.fbsService.getInvoices(userId, storeId, statuses, page, size);
    }
    getInvoice(userId, storeId, invoiceId) {
        return this.fbsService.getInvoice(userId, storeId, invoiceId);
    }
    getInvoiceOrders(userId, storeId, invoiceId) {
        return this.fbsService.getInvoiceOrders(userId, storeId, invoiceId);
    }
    async getInvoiceAct(userId, storeId, invoiceId, res) {
        const buffer = await this.fbsService.getInvoiceActPdf(userId, storeId, invoiceId);
        if (!buffer)
            throw new common_1.NotFoundException(`Ta'minlash #${invoiceId} akti mavjud emas`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="act_${invoiceId}.pdf"`);
        res.send(buffer);
    }
    async getInvoiceClosing(userId, storeId, invoiceId, res) {
        const buffer = await this.fbsService.getInvoiceClosingPdf(userId, storeId, invoiceId);
        if (!buffer)
            throw new common_1.NotFoundException(`Ta'minlash #${invoiceId} qabul akti mavjud emas`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="closing_${invoiceId}.pdf"`);
        res.send(buffer);
    }
    cancelInvoice(userId, storeId, invoiceId) {
        return this.fbsService.cancelInvoice(userId, storeId, invoiceId);
    }
    createInvoice(userId, storeId, dto) {
        return this.fbsService.createInvoice(userId, storeId, dto);
    }
    getDropOffPoints(userId, storeId, orderIds) {
        const ids = (orderIds || '').split(',').filter(Boolean);
        return this.fbsService.getInvoiceDropOffPoints(userId, storeId, ids);
    }
    getTimeSlots(userId, storeId, dopId, orderIds) {
        const ids = (orderIds || '').split(',').filter(Boolean);
        return this.fbsService.getInvoiceTimeSlots(userId, storeId, dopId, ids);
    }
    getProductAnalytics(userId, storeId, force) {
        return this.fbsService.getProductAnalytics(userId, storeId, force === '1' || force === 'true');
    }
    getLiveProducts(userId, storeId, page, size, filter, searchQuery, sortBy, order) {
        return this.fbsService.getLiveProducts(userId, storeId, page, size, filter, searchQuery, sortBy, order);
    }
    getLiveFinanceOrders(userId, storeId, page, size, dateFrom, dateTo) {
        return this.fbsService.getLiveFinanceOrders(userId, storeId, page, size, dateFrom ? parseInt(dateFrom, 10) : undefined, dateTo ? parseInt(dateTo, 10) : undefined);
    }
    getLiveStocks(userId, storeId, force) {
        return this.fbsService.getLiveStocks(userId, storeId, force === '1' || force === 'true');
    }
    setStocks(userId, storeId, dto) {
        return this.fbsService.setStocks(userId, storeId, dto.updates);
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
    getBatchBarcodes(userId, storeId, dto) {
        return this.fbsService.getOrderItemBarcodes(userId, storeId, dto.orderIds);
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
    (0, common_1.Post)('orders/:orderId/confirm'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "confirmOrder", null);
__decorate([
    (0, common_1.Post)('orders/:orderId/cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, CancelOrderDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Post)('orders/:orderId/identifiers'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, SetIdentifiersDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "setIdentifiers", null);
__decorate([
    (0, common_1.Get)('return-reasons'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getReturnReasons", null);
__decorate([
    (0, common_1.Post)('dbs/orders/:orderId/delivering'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "dbsDelivering", null);
__decorate([
    (0, common_1.Post)('dbs/orders/:orderId/completed'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __param(3, (0, common_1.Query)('issueCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "dbsCompleted", null);
__decorate([
    (0, common_1.Post)('dbs/orders/:orderId/refund'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "dbsRefund", null);
__decorate([
    (0, common_1.Post)('products/prices'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, UpdatePricesDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "updatePrices", null);
__decorate([
    (0, common_1.Get)('returns'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('size', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('returnId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getReturns", null);
__decorate([
    (0, common_1.Get)('supply-invoices'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('size', new common_1.DefaultValuePipe(50), common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getSupplyInvoices", null);
__decorate([
    (0, common_1.Get)('invoices'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('statuses')),
    __param(3, (0, common_1.Query)('page', new common_1.DefaultValuePipe(0), common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('size', new common_1.DefaultValuePipe(20), common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId/orders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getInvoiceOrders", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId/act'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('invoiceId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], FbsController.prototype, "getInvoiceAct", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId/closing-documents'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('invoiceId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], FbsController.prototype, "getInvoiceClosing", null);
__decorate([
    (0, common_1.Post)('invoices/:invoiceId/cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "cancelInvoice", null);
__decorate([
    (0, common_1.Post)('invoices'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, CreateInvoiceDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "createInvoice", null);
__decorate([
    (0, common_1.Get)('invoices/dop/drop-off-points'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('orderIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getDropOffPoints", null);
__decorate([
    (0, common_1.Get)('invoices/dop/time-slots'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('dopId')),
    __param(3, (0, common_1.Query)('orderIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getTimeSlots", null);
__decorate([
    (0, common_1.Get)('products/analytics'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getProductAnalytics", null);
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
    __param(2, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getLiveStocks", null);
__decorate([
    (0, common_1.Post)('stocks'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, SetStocksDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "setStocks", null);
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
__decorate([
    (0, common_1.Post)('barcodes/batch'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, BatchLabelsDto]),
    __metadata("design:returntype", void 0)
], FbsController.prototype, "getBatchBarcodes", null);
exports.FbsController = FbsController = __decorate([
    (0, common_1.Controller)('marketplace/stores/:storeId/fbs'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [fbs_service_1.FbsService])
], FbsController);
//# sourceMappingURL=fbs.controller.js.map