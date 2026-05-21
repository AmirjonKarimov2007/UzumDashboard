"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UzumModule = void 0;
const common_1 = require("@nestjs/common");
const uzum_api_client_1 = require("./client/uzum-api.client");
const database_module_1 = require("../common/database/database.module");
let UzumModule = class UzumModule {
};
exports.UzumModule = UzumModule;
exports.UzumModule = UzumModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        providers: [uzum_api_client_1.UzumApiClient],
        exports: [uzum_api_client_1.UzumApiClient],
    })
], UzumModule);
//# sourceMappingURL=uzum.module.js.map