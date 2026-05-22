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
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = exports.SyncJobType = exports.SYNC_QUEUE = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../common/database/prisma.service");
const stores_service_1 = require("../marketplace/stores/stores.service");
exports.SYNC_QUEUE = 'sync';
exports.SyncJobType = {
    FULL_SYNC: 'full-sync',
    SYNC_PRODUCTS: 'sync-products',
    SYNC_ORDERS: 'sync-orders',
    SYNC_ANALYTICS: 'sync-analytics',
    SYNC_INVENTORY: 'sync-inventory',
    SYNC_EXPENSES: 'sync-expenses',
};
let SyncService = SyncService_1 = class SyncService {
    constructor(syncQueue, prisma, storesService) {
        this.syncQueue = syncQueue;
        this.prisma = prisma;
        this.storesService = storesService;
        this.logger = new common_1.Logger(SyncService_1.name);
    }
    async triggerFullSync(storeId) {
        const conn = await this.storesService.getConnectionInfo(storeId);
        if (!conn?.isConnected) {
            throw new Error(`Store ${storeId} is not connected to Uzum`);
        }
        const job = await this.syncQueue.add(exports.SyncJobType.FULL_SYNC, { storeId, uzumShopId: conn.uzumShopId, fullSync: true }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 50,
            removeOnFail: 20,
        });
        this.logger.log(`Queued full sync for store ${storeId}, job ${job.id}`);
        return { jobId: job.id };
    }
    async triggerPartialSync(storeId, type, dateFrom, dateTo) {
        const conn = await this.storesService.getConnectionInfo(storeId);
        if (!conn?.isConnected)
            throw new Error(`Store ${storeId} is not connected`);
        const job = await this.syncQueue.add(type, { storeId, uzumShopId: conn.uzumShopId, dateFrom, dateTo }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 50,
            removeOnFail: 20,
        });
        return { jobId: job.id };
    }
    async scheduleAllAutoSyncJobs() {
        const connected = await this.storesService.getConnectedStores();
        this.logger.log(`Scheduling auto-sync for ${connected.length} connected stores`);
        for (const { storeId, uzumShopId } of connected) {
            const conn = await this.storesService.getConnectionInfo(storeId);
            if (!conn?.isAutoSync)
                continue;
            const baseData = { storeId, uzumShopId };
            await this.syncQueue.add(exports.SyncJobType.SYNC_ORDERS, baseData, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 },
                removeOnComplete: 10,
                removeOnFail: 5,
            });
        }
    }
    async getSyncStatus(storeId) {
        const conn = await this.storesService.getConnectionInfo(storeId);
        const recentLogs = await this.prisma.syncLog.findMany({
            where: { storeId },
            orderBy: { startedAt: 'desc' },
            take: 10,
        });
        let queuedJobs = 0;
        let activeJobs = 0;
        try {
            const [waiting, active] = await Promise.all([
                this.syncQueue.getWaiting(),
                this.syncQueue.getActive(),
            ]);
            queuedJobs = waiting.filter((j) => j.data.storeId === storeId).length;
            activeJobs = active.filter((j) => j.data.storeId === storeId).length;
        }
        catch (err) {
            this.logger.warn(`Queue inspection failed: ${err.message}`);
        }
        return {
            isConnected: conn?.isConnected ?? false,
            isAutoSync: conn?.isAutoSync ?? false,
            lastSyncAt: conn?.lastSyncAt,
            lastSyncStatus: conn?.lastSyncStatus,
            lastSyncError: conn?.lastSyncError,
            rateLimitRemaining: conn?.rateLimitRemaining,
            rateLimitDayRemaining: conn?.rateLimitDayRemaining,
            uzumShopId: conn?.uzumShopId,
            queuedJobs,
            activeJobs,
            recentLogs,
        };
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(exports.SYNC_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        prisma_service_1.PrismaService,
        stores_service_1.StoresService])
], SyncService);
//# sourceMappingURL=sync.service.js.map