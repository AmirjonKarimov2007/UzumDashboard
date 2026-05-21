"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const schedule_1 = require("@nestjs/schedule");
const sync_service_1 = require("./sync.service");
const sync_controller_1 = require("./sync.controller");
const sync_scheduler_1 = require("./sync.scheduler");
const full_sync_processor_1 = require("./processors/full-sync.processor");
const stores_module_1 = require("../marketplace/stores/stores.module");
const products_module_1 = require("../marketplace/products/products.module");
const orders_module_1 = require("../marketplace/orders/orders.module");
const finance_module_1 = require("../marketplace/finance/finance.module");
const inventory_module_1 = require("../marketplace/inventory/inventory.module");
const database_module_1 = require("../common/database/database.module");
let SyncModule = class SyncModule {
};
exports.SyncModule = SyncModule;
exports.SyncModule = SyncModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            schedule_1.ScheduleModule.forRoot(),
            bullmq_1.BullModule.registerQueue({ name: sync_service_1.SYNC_QUEUE }),
            stores_module_1.StoresModule,
            products_module_1.ProductsModule,
            orders_module_1.OrdersModule,
            finance_module_1.FinanceModule,
            inventory_module_1.InventoryModule,
        ],
        controllers: [sync_controller_1.SyncController],
        providers: [sync_service_1.SyncService, full_sync_processor_1.SyncProcessor, sync_scheduler_1.SyncScheduler],
        exports: [sync_service_1.SyncService],
    })
], SyncModule);
//# sourceMappingURL=sync.module.js.map