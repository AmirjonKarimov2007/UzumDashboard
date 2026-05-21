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
exports.StoresController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const stores_service_1 = require("./stores.service");
const stores_dto_1 = require("./dto/stores.dto");
let StoresController = class StoresController {
    constructor(storesService) {
        this.storesService = storesService;
    }
    getStores(userId) {
        return this.storesService.getStores(userId);
    }
    getStore(userId, storeId) {
        return this.storesService.getStore(userId, storeId);
    }
    connectStore(userId, storeId, dto) {
        return this.storesService.connectStore(userId, storeId, dto);
    }
    disconnectStore(userId, storeId) {
        return this.storesService.disconnectStore(userId, storeId);
    }
    testConnection(userId, storeId) {
        return this.storesService.testConnection(userId, storeId);
    }
    updateConnectionSettings(userId, storeId, dto) {
        return this.storesService.updateConnectionSettings(userId, storeId, dto);
    }
};
exports.StoresController = StoresController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "getStores", null);
__decorate([
    (0, common_1.Get)(':storeId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "getStore", null);
__decorate([
    (0, common_1.Post)(':storeId/connect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, stores_dto_1.ConnectStoreDto]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "connectStore", null);
__decorate([
    (0, common_1.Post)(':storeId/disconnect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "disconnectStore", null);
__decorate([
    (0, common_1.Get)(':storeId/test-connection'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "testConnection", null);
__decorate([
    (0, common_1.Patch)(':storeId/connection-settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Param)('storeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, stores_dto_1.UpdateConnectionDto]),
    __metadata("design:returntype", void 0)
], StoresController.prototype, "updateConnectionSettings", null);
exports.StoresController = StoresController = __decorate([
    (0, common_1.Controller)('marketplace/stores'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [stores_service_1.StoresService])
], StoresController);
//# sourceMappingURL=stores.controller.js.map