import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SyncJobData } from '../sync.service';
import { ProductsSyncService } from '../../marketplace/products/products-sync.service';
import { OrdersSyncService } from '../../marketplace/orders/orders-sync.service';
import { FinanceSyncService } from '../../marketplace/finance/finance-sync.service';
import { InventorySyncService } from '../../marketplace/inventory/inventory-sync.service';
import { StoresService } from '../../marketplace/stores/stores.service';
import { PrismaService } from '../../common/database/prisma.service';
export declare class SyncProcessor extends WorkerHost {
    private readonly productsSyncService;
    private readonly ordersSyncService;
    private readonly financeSyncService;
    private readonly inventorySyncService;
    private readonly storesService;
    private readonly prisma;
    private readonly logger;
    constructor(productsSyncService: ProductsSyncService, ordersSyncService: OrdersSyncService, financeSyncService: FinanceSyncService, inventorySyncService: InventorySyncService, storesService: StoresService, prisma: PrismaService);
    process(job: Job<SyncJobData>): Promise<void>;
    private jobNameToSyncType;
}
