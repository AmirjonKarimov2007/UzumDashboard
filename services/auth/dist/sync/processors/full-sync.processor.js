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
var SyncProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const sync_service_1 = require("../sync.service");
const products_sync_service_1 = require("../../marketplace/products/products-sync.service");
const orders_sync_service_1 = require("../../marketplace/orders/orders-sync.service");
const finance_sync_service_1 = require("../../marketplace/finance/finance-sync.service");
const inventory_sync_service_1 = require("../../marketplace/inventory/inventory-sync.service");
const stores_service_1 = require("../../marketplace/stores/stores.service");
const prisma_service_1 = require("../../common/database/prisma.service");
let SyncProcessor = SyncProcessor_1 = class SyncProcessor extends bullmq_1.WorkerHost {
    constructor(productsSyncService, ordersSyncService, financeSyncService, inventorySyncService, storesService, prisma) {
        super();
        this.productsSyncService = productsSyncService;
        this.ordersSyncService = ordersSyncService;
        this.financeSyncService = financeSyncService;
        this.inventorySyncService = inventorySyncService;
        this.storesService = storesService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(SyncProcessor_1.name);
    }
    async process(job) {
        const { storeId, uzumShopId, dateFrom, dateTo, fullSync } = job.data;
        this.logger.log(`Processing job ${job.name} for store ${storeId}`);
        const syncLog = await this.prisma.syncLog.create({
            data: {
                storeId,
                syncType: this.jobNameToSyncType(job.name),
                status: 'RUNNING',
            },
        });
        try {
            await this.storesService.markSyncStarted(storeId);
            const apiKey = await this.storesService.getDecryptedApiKey(storeId);
            if (!apiKey)
                throw new Error('No API key available');
            let itemsSynced = 0;
            switch (job.name) {
                case sync_service_1.SyncJobType.FULL_SYNC:
                    await job.updateProgress(5);
                    itemsSynced += await this.productsSyncService.syncProducts(storeId, uzumShopId, apiKey);
                    await job.updateProgress(30);
                    itemsSynced += await this.ordersSyncService.syncOrders(storeId, uzumShopId, apiKey, dateFrom, dateTo);
                    await job.updateProgress(60);
                    itemsSynced += await this.financeSyncService.syncExpenses(storeId, uzumShopId, apiKey, dateFrom, dateTo);
                    await job.updateProgress(75);
                    await this.financeSyncService.buildAnalyticsSnapshots(storeId);
                    await job.updateProgress(90);
                    await this.inventorySyncService.syncInventory(storeId, uzumShopId, apiKey);
                    await job.updateProgress(100);
                    break;
                case sync_service_1.SyncJobType.SYNC_PRODUCTS:
                    itemsSynced = await this.productsSyncService.syncProducts(storeId, uzumShopId, apiKey);
                    break;
                case sync_service_1.SyncJobType.SYNC_ORDERS:
                    itemsSynced = await this.ordersSyncService.syncOrders(storeId, uzumShopId, apiKey, dateFrom, dateTo);
                    await this.financeSyncService.buildAnalyticsSnapshots(storeId);
                    break;
                case sync_service_1.SyncJobType.SYNC_ANALYTICS:
                    await this.financeSyncService.buildAnalyticsSnapshots(storeId);
                    break;
                case sync_service_1.SyncJobType.SYNC_INVENTORY:
                    itemsSynced = await this.inventorySyncService.syncInventory(storeId, uzumShopId, apiKey);
                    break;
                case sync_service_1.SyncJobType.SYNC_EXPENSES:
                    itemsSynced = await this.financeSyncService.syncExpenses(storeId, uzumShopId, apiKey, dateFrom, dateTo);
                    break;
            }
            await this.prisma.syncLog.update({
                where: { id: syncLog.id },
                data: { status: 'SUCCESS', completedAt: new Date(), itemsSynced },
            });
            await this.storesService.markSyncCompleted(storeId);
            this.logger.log(`Sync ${job.name} completed for store ${storeId}: ${itemsSynced} items`);
        }
        catch (error) {
            const message = error.message;
            this.logger.error(`Sync ${job.name} failed for store ${storeId}: ${message}`);
            await this.prisma.syncLog.update({
                where: { id: syncLog.id },
                data: { status: 'FAILED', completedAt: new Date(), error: message },
            });
            await this.storesService.markSyncFailed(storeId, message);
            throw error;
        }
    }
    jobNameToSyncType(jobName) {
        const map = {
            [sync_service_1.SyncJobType.FULL_SYNC]: 'FULL',
            [sync_service_1.SyncJobType.SYNC_PRODUCTS]: 'PRODUCTS',
            [sync_service_1.SyncJobType.SYNC_ORDERS]: 'ORDERS',
            [sync_service_1.SyncJobType.SYNC_ANALYTICS]: 'ANALYTICS',
            [sync_service_1.SyncJobType.SYNC_INVENTORY]: 'INVENTORY',
            [sync_service_1.SyncJobType.SYNC_EXPENSES]: 'EXPENSES',
        };
        return map[jobName] || 'FULL';
    }
};
exports.SyncProcessor = SyncProcessor;
exports.SyncProcessor = SyncProcessor = SyncProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(sync_service_1.SYNC_QUEUE),
    __metadata("design:paramtypes", [products_sync_service_1.ProductsSyncService,
        orders_sync_service_1.OrdersSyncService,
        finance_sync_service_1.FinanceSyncService,
        inventory_sync_service_1.InventorySyncService,
        stores_service_1.StoresService,
        prisma_service_1.PrismaService])
], SyncProcessor);
//# sourceMappingURL=full-sync.processor.js.map