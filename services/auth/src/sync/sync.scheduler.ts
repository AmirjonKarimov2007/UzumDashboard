import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncService, SyncJobType } from './sync.service';
import { StoresService } from '../marketplace/stores/stores.service';

/**
 * If BullMQ can't enqueue jobs (e.g. local Redis is older than required 5.0),
 * keep retrying forever spams the log and slowly leaks rejected promises until
 * the process dies. Once we hit that, we set this flag and silently no-op all
 * scheduler ticks until the service is restarted (with a compatible Redis).
 */
let queueDisabled = false;
let disableReason = '';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly storesService: StoresService,
  ) {}

  private async safeRun(label: string, fn: () => Promise<unknown>): Promise<void> {
    if (queueDisabled) return;
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // Detect permanent-environmental failures and short-circuit subsequent ticks.
      if (msg.includes('Redis version') || msg.includes('ECONNREFUSED') || msg.includes('NOAUTH')) {
        queueDisabled = true;
        disableReason = msg;
        this.logger.error(
          `Sync queue disabled — Redis unhealthy (${msg}). ` +
          `Auto-sync turned off until restart. Sales/orders endpoints remain available.`,
        );
        return;
      }
      this.logger.error(`${label}: ${msg}`);
    }
  }

  // Orders: every 5 minutes
  @Cron('*/5 * * * *')
  async syncOrdersAll() {
    if (queueDisabled) return;
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      await this.safeRun(`Failed to queue order sync for store ${storeId}`, () =>
        this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_ORDERS),
      );
    }
  }

  // Products & Inventory: every 30 minutes
  @Cron('*/30 * * * *')
  async syncProductsAll() {
    if (queueDisabled) return;
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      await this.safeRun(`Failed to queue product sync for store ${storeId}`, async () => {
        await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_PRODUCTS);
        if (!queueDisabled) await this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_INVENTORY);
      });
    }
  }

  // Analytics snapshots: every 15 minutes
  @Cron('*/15 * * * *')
  async syncAnalyticsAll() {
    if (queueDisabled) return;
    const stores = await this.storesService.getConnectedStores();
    for (const { storeId } of stores) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;
      await this.safeRun(`Failed to queue analytics sync for store ${storeId}`, () =>
        this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_ANALYTICS),
      );
    }
  }

  /** Whether auto-sync queue is currently disabled (exposed for diagnostics). */
  static isQueueDisabled() {
    return { disabled: queueDisabled, reason: disableReason };
  }
}
