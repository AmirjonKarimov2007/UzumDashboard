"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FbsModule = void 0;
const common_1 = require("@nestjs/common");
const fbs_controller_1 = require("./fbs.controller");
const fbs_service_1 = require("./fbs.service");
const uzum_module_1 = require("../../uzum/uzum.module");
const stores_module_1 = require("../stores/stores.module");
const finance_module_1 = require("../finance/finance.module");
let FbsModule = class FbsModule {
};
exports.FbsModule = FbsModule;
exports.FbsModule = FbsModule = __decorate([
    (0, common_1.Module)({
        imports: [uzum_module_1.UzumModule, stores_module_1.StoresModule, finance_module_1.FinanceModule],
        controllers: [fbs_controller_1.FbsController],
        providers: [fbs_service_1.FbsService],
        exports: [fbs_service_1.FbsService],
    })
], FbsModule);
//# sourceMappingURL=fbs.module.js.map