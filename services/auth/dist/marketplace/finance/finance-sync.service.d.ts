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
    private swrStore;
    private swrInflight;
    private swrDiskPath;
    private swrRun;
    private swrRevalidate;
    private swr;
    getLogisticsAndFines(userId: string, storeId: string, opts?: {
        force?: boolean;
    }): Promise<any>;
    private computeLogisticsAndFines;
    getProcessingAndWithdraw(userId: string, storeId: string, opts?: {
        force?: boolean;
    }): Promise<any>;
    private computeProcessingAndWithdraw;
    private resolveRange;
    getDashboardSummary(userId: string, storeId: string, opts?: {
        force?: boolean;
        timeRange?: string;
        dateFrom?: number;
        dateTo?: number;
    }): Promise<any>;
    resolveCosts(userId: string, storeId: string, force?: boolean): Promise<{
        activeProducts: number;
        skusWithCost: number;
        costByFullTitle: Record<string, number>;
        costByProductId: Record<string, number>;
        titleByProductId: Record<string, string>;
        categoryByProductId: Record<string, string>;
        imageByProductId: Record<string, string>;
    }>;
    private getCostResolution;
    private pickProductImage;
    private computeCostResolution;
    private computeDashboardSummary;
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
