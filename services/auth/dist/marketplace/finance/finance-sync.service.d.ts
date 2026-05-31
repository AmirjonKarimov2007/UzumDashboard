import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
export declare class FinanceSyncService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly storesService;
    private readonly logger;
    private reconCache;
    private readonly RECON_CACHE_TTL_MS;
    private reconInflight;
    private readonly diskCacheDir;
    private readonly diskCacheTtlMs;
    private diskCachePath;
    private readDiskCache;
    private writeDiskCache;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient, storesService: StoresService);
    private logisticsFinesCache;
    getLogisticsAndFines(userId: string, storeId: string, opts?: {
        force?: boolean;
    }): Promise<any>;
    private procWithdrawCache;
    getProcessingAndWithdraw(userId: string, storeId: string, opts?: {
        force?: boolean;
    }): Promise<any>;
    getReconciliation(userId: string, storeId: string, opts?: {
        dateFrom?: number;
        dateTo?: number;
        force?: boolean;
    }): Promise<any>;
    private getFbsBalance;
    private fetchReconciliation;
    syncExpenses(storeId: string, uzumShopId: string, apiKey: string, dateFrom?: string, dateTo?: string): Promise<number>;
    buildAnalyticsSnapshots(storeId: string): Promise<void>;
    private mapExpenseCategory;
}
