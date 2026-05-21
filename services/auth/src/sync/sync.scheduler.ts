import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncService, SyncJobType } from './sync.service';
import { StoresService } from '../marketplace/stores/stores.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly storesService: StoresService,
  ) {}

  // Orders: every 5 minutes
  @Cron('*/5 * * * *')
  async syncOrdersAll() {
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId, uzumShopId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      try {
        await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_ORDERS);
      } catch (e) {
        this.logger.error(`Failed to queue order sync for store ${storeId}: ${(e as Error).message}`);
      }
    }
  }

  // Products & Inventory: every 30 minutes
  @Cron('*/30 * * * *')
  async syncProductsAll() {
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      try {
        await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_PRODUCTS);
        await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_INVENTORY);
      } catch (e) {
        this.logger.error(`Failed to queue product sync for store ${storeId}: ${(e as Error).message}`);
      }
    }
  }

  // Analytics snapshots: every 15 minutes
  @Cron('*/15 * * * *')
  async syncAnalyticsAll() {
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      try {
        await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_ANALYTICS);
      } catch (e) {
        this.logger.error(`Failed to queue analytics sync for store ${storeId}: ${(e as Error).message}`);
      }
    }
  }
}
