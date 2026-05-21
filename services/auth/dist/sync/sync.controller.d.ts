import { SyncService } from './sync.service';
export declare class SyncController {
    private readonly syncService;
    constructor(syncService: SyncService);
    triggerFullSync(storeId: string): Promise<{
        jobId: string;
    }>;
    syncOrders(storeId: string, dateFrom?: string, dateTo?: string): Promise<{
        jobId: string;
    }>;
    syncProducts(storeId: string): Promise<{
        jobId: string;
    }>;
    syncInventory(storeId: string): Promise<{
        jobId: string;
    }>;
    syncExpenses(storeId: string, dateFrom?: string, dateTo?: string): Promise<{
        jobId: string;
    }>;
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
