import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE, SyncJobType, SyncJobData } from '../sync.service';
import { ProductsSyncService } from '../../marketplace/products/products-sync.service';
import { OrdersSyncService } from '../../marketplace/orders/orders-sync.service';
import { FinanceSyncService } from '../../marketplace/finance/finance-sync.service';
import { InventorySyncService } from '../../marketplace/inventory/inventory-sync.service';
import { StoresService } from '../../marketplace/stores/stores.service';
import { PrismaService } from '../../common/database/prisma.service';

@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly productsSyncService: ProductsSyncService,
    private readonly ordersSyncService: OrdersSyncService,
    private readonly financeSyncService: FinanceSyncService,
    private readonly inventorySyncService: InventorySyncService,
    private readonly storesService: StoresService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { storeId, uzumShopId, dateFrom, dateTo, fullSync } = job.data;

    this.logger.log(`Processing job ${job.name} for store ${storeId}`);

    const syncLog = await this.prisma.syncLog.create({
      data: {
        storeId,
        syncType: this.jobNameToSyncType(job.name),
        status: 'RUNNING',
      },
    });

    try {
      await this.storesService.markSyncStarted(storeId);

      const apiKey = await this.storesService.getDecryptedApiKey(storeId);
      if (!apiKey) throw new Error('No API key available');

      let itemsSynced = 0;

      switch (job.name) {
        case SyncJobType.FULL_SYNC:
          await job.updateProgress(5);
          itemsSynced += await this.productsSyncService.syncProducts(storeId, uzumShopId, apiKey);
          await job.updateProgress(30);
          itemsSynced += await this.ordersSyncService.syncOrders(storeId, uzumShopId, apiKey, dateFrom, dateTo);
          await job.updateProgress(60);
          itemsSynced += await this.financeSyncService.syncExpenses(storeId, uzumShopId, apiKey, dateFrom, dateTo);
          await job.updateProgress(75);
          await this.financeSyncService.buildAnalyticsSnapshots(storeId);
          await job.updateProgress(90);
          await this.inventorySyncService.syncInventory(storeId, uzumShopId, apiKey);
          await job.updateProgress(100);
          break;

        case SyncJobType.SYNC_PRODUCTS:
          itemsSynced = await this.productsSyncService.syncProducts(storeId, uzumShopId, apiKey);
          break;

        case SyncJobType.SYNC_ORDERS:
          itemsSynced = await this.ordersSyncService.syncOrders(storeId, uzumShopId, apiKey, dateFrom, dateTo);
          await this.financeSyncService.buildAnalyticsSnapshots(storeId);
          break;

        case SyncJobType.SYNC_ANALYTICS:
          await this.financeSyncService.buildAnalyticsSnapshots(storeId);
          break;

        case SyncJobType.SYNC_INVENTORY:
          itemsSynced = await this.inventorySyncService.syncInventory(storeId, uzumShopId, apiKey);
          break;

        case SyncJobType.SYNC_EXPENSES:
          itemsSynced = await this.financeSyncService.syncExpenses(storeId, uzumShopId, apiKey, dateFrom, dateTo);
          break;
      }

      await this.prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'SUCCESS', completedAt: new Date(), itemsSynced },
      });

      await this.storesService.markSyncCompleted(storeId);
      this.logger.log(`Sync ${job.name} completed for store ${storeId}: ${itemsSynced} items`);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Sync ${job.name} failed for store ${storeId}: ${message}`);

      await this.prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'FAILED', completedAt: new Date(), error: message },
      });

      await this.storesService.markSyncFailed(storeId, message);
      throw error;
    }
  }

  private jobNameToSyncType(jobName: string): any {
    const map: Record<string, string> = {
      [SyncJobType.FULL_SYNC]: 'FULL',
      [SyncJobType.SYNC_PRODUCTS]: 'PRODUCTS',
      [SyncJobType.SYNC_ORDERS]: 'ORDERS',
      [SyncJobType.SYNC_ANALYTICS]: 'ANALYTICS',
      [SyncJobType.SYNC_INVENTORY]: 'INVENTORY',
      [SyncJobType.SYNC_EXPENSES]: 'EXPENSES',
    };
    return map[jobName] || 'FULL';
  }
}
