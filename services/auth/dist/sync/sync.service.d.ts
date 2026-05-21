import { Queue } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { StoresService } from '../marketplace/stores/stores.service';
export declare const SYNC_QUEUE = "sync";
export declare const SyncJobType: {
    readonly FULL_SYNC: "full-sync";
    readonly SYNC_PRODUCTS: "sync-products";
    readonly SYNC_ORDERS: "sync-orders";
    readonly SYNC_ANALYTICS: "sync-analytics";
    readonly SYNC_INVENTORY: "sync-inventory";
    readonly SYNC_EXPENSES: "sync-expenses";
};
export type SyncJobType = (typeof SyncJobType)[keyof typeof SyncJobType];
export interface SyncJobData {
    storeId: string;
    uzumShopId: string;
    dateFrom?: string;
    dateTo?: string;
    fullSync?: boolean;
}
export declare class SyncService {
    private readonly syncQueue;
    private readonly prisma;
    private readonly storesService;
    private readonly logger;
    constructor(syncQueue: Queue, prisma: PrismaService, storesService: StoresService);
    triggerFullSync(storeId: string): Promise<{
        jobId: string;
    }>;
    triggerPartialSync(storeId: string, type: SyncJobType, dateFrom?: string, dateTo?: string): Promise<{
        jobId: string;
    }>;
    scheduleAllAutoSyncJobs(): Promise<void>;
    getSyncStatus(storeId: string): Promise<{
        isConnected: boolean;
        isAutoSync: boolean;
        lastSyncAt: Date | null | undefined;
        lastSyncStatus: import(".prisma/client").$Enums.SyncStatus | undefined;
        lastSyncError: string | null | undefined;
        rateLimitRemaining: number | null | undefined;
        rateLimitDayRemaining: number | null | undefined;
        queuedJobs: number;
        activeJobs: number;
        recentLogs: {
            error: string | null;
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            status: import(".prisma/client").$Enums.SyncStatus;
            storeId: string;
            syncType: import(".prisma/client").$Enums.SyncType;
            startedAt: Date;
            completedAt: Date | null;
            itemsSynced: number;
        }[];
    }>;
}
