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
var SyncScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const sync_service_1 = require("./sync.service");
const stores_service_1 = require("../marketplace/stores/stores.service");
let queueDisabled = false;
let disableReason = '';
let SyncScheduler = SyncScheduler_1 = class SyncScheduler {
    constructor(syncService, storesService) {
        this.syncService = syncService;
        this.storesService = storesService;
        this.logger = new common_1.Logger(SyncScheduler_1.name);
    }
    async safeRun(label, fn) {
        if (queueDisabled)
            return;
        try {
            await fn();
        }
        catch (e) {
            const msg = e.message || String(e);
            if (msg.includes('Redis version') || msg.includes('ECONNREFUSED') || msg.includes('NOAUTH')) {
                queueDisabled = true;
                disableReason = msg;
                this.logger.error(`Sync queue disabled — Redis unhealthy (${msg}). ` +
                    `Auto-sync turned off until restart. Sales/orders endpoints remain available.`);
                return;
            }
            this.logger.error(`${label}: ${msg}`);
        }
    }
    async syncOrdersAll() {
        if (queueDisabled)
            return;
        const stores = await this.storesService.getConnectedStores();
        for (const { storeId } of stores) {
            const conn = await this.storesService.getConnectionInfo(storeId);
            if (!conn?.isAutoSync)
                continue;
            await this.safeRun(`Failed to queue order sync for store ${storeId}`, () => this.syncService.triggerPartialSync(storeId, sync_service_1.SyncJobType.SYNC_ORDERS));
        }
    }
    async syncProductsAll() {
        if (queueDisabled)
            return;
        const stores = await this.storesService.getConnectedStores();
        for (const { storeId } of stores) {
            const conn = await this.storesService.getConnectionInfo(storeId);
            if (!conn?.isAutoSync)
                continue;
            await this.safeRun(`Failed to queue product sync for store ${storeId}`, async () => {
                await this.syncService.triggerPartialSync(storeId, sync_service_1.SyncJobType.SYNC_PRODUCTS);
                if (!queueDisabled)
                    await this.syncService.triggerPartialSync(storeId, sync_service_1.SyncJobType.SYNC_INVENTORY);
            });
        }
    }
    async syncAnalyticsAll() {
        if (queueDisabled)
            return;
        const stores = await this.storesService.getConnectedStores();
        for (const { storeId } of stores) {
            const conn = await this.storesService.getConnectionInfo(storeId);
            if (!conn?.isAutoSync)
                continue;
            await this.safeRun(`Failed to queue analytics sync for store ${storeId}`, () => this.syncService.triggerPartialSync(storeId, sync_service_1.SyncJobType.SYNC_ANALYTICS));
        }
    }
    static isQueueDisabled() {
        return { disabled: queueDisabled, reason: disableReason };
    }
};
exports.SyncScheduler = SyncScheduler;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncScheduler.prototype, "syncOrdersAll", null);
__decorate([
    (0, schedule_1.Cron)('*/30 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncScheduler.prototype, "syncProductsAll", null);
__decorate([
    (0, schedule_1.Cron)('*/15 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncScheduler.prototype, "syncAnalyticsAll", null);
exports.SyncScheduler = SyncScheduler = SyncScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [sync_service_1.SyncService,
        stores_service_1.StoresService])
], SyncScheduler);
//# sourceMappingURL=sync.scheduler.js.map