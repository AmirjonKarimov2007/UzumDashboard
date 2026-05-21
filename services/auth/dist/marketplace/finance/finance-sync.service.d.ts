import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
export declare class FinanceSyncService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly logger;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient);
    syncExpenses(storeId: string, uzumShopId: string, apiKey: string, dateFrom?: string, dateTo?: string): Promise<number>;
    buildAnalyticsSnapshots(storeId: string): Promise<void>;
    private mapExpenseCategory;
}
