import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
export declare class ProductsSyncService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly logger;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient);
    syncProducts(storeId: string, uzumShopId: string, apiKey: string): Promise<number>;
    private mapProductStatus;
}
