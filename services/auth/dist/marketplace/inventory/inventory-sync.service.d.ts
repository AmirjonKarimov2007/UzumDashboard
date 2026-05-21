import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
export declare class InventorySyncService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly logger;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient);
    syncInventory(storeId: string, uzumShopId: string, apiKey: string): Promise<number>;
    private updateInventoryComputedFields;
    private getSoldLast30Days;
    private computeInventoryStatus;
}
