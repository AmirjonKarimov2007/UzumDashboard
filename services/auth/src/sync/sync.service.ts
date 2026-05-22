import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { StoresService } from '../marketplace/stores/stores.service';

export const SYNC_QUEUE = 'sync';

export const SyncJobType = {
  FULL_SYNC: 'full-sync',
  SYNC_PRODUCTS: 'sync-products',
  SYNC_ORDERS: 'sync-orders',
  SYNC_ANALYTICS: 'sync-analytics',
  SYNC_INVENTORY: 'sync-inventory',
  SYNC_EXPENSES: 'sync-expenses',
} as const;

export type SyncJobType = (typeof SyncJobType)[keyof typeof SyncJobType];

export interface SyncJobData {
  storeId: string;
  uzumShopId: string;
  dateFrom?: string;
  dateTo?: string;
  fullSync?: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectQueue(SYNC_QUEUE) private readonly syncQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly storesService: StoresService,
  ) {}

  async triggerFullSync(storeId: string): Promise<{ jobId: string }> {
    const conn = await this.storesService.getConnectionInfo(storeId);
    if (!conn?.isConnected) {
      throw new Error(`Store ${storeId} is not connected to Uzum`);
    }

    const job = await this.syncQueue.add(
      SyncJobType.FULL_SYNC,
      { storeId, uzumShopId: conn.uzumShopId, fullSync: true } satisfies SyncJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    this.logger.log(`Queued full sync for store ${storeId}, job ${job.id}`);
    return { jobId: job.id! };
  }

  async triggerPartialSync(
    storeId: string,
    type: SyncJobType,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ jobId: string }> {
    const conn = await this.storesService.getConnectionInfo(storeId);
    if (!conn?.isConnected) throw new Error(`Store ${storeId} is not connected`);

    const job = await this.syncQueue.add(
      type,
      { storeId, uzumShopId: conn.uzumShopId, dateFrom, dateTo } satisfies SyncJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    return { jobId: job.id! };
  }

  async scheduleAllAutoSyncJobs(): Promise<void> {
    const connected = await this.storesService.getConnectedStores();
    this.logger.log(`Scheduling auto-sync for ${connected.length} connected stores`);

    for (const { storeId, uzumShopId } of connected) {
      const conn = await this.storesService.getConnectionInfo(storeId);
      if (!conn?.isAutoSync) continue;

      const baseData: SyncJobData = { storeId, uzumShopId };

      // Orders: every 5 min (handled by scheduler, not repeatable jobs to avoid duplicate tracking)
      await this.syncQueue.add(SyncJobType.SYNC_ORDERS, baseData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 10,
        removeOnFail: 5,
      });
    }
  }

  async getSyncStatus(storeId: string) {
    const conn = await this.storesService.getConnectionInfo(storeId);
    const recentLogs = await this.prisma.syncLog.findMany({
      where: { storeId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    // Queue inspection — guarded; failures shouldn't break status response
    let queuedJobs = 0;
    let activeJobs = 0;
    try {
      const [waiting, active] = await Promise.all([
        this.syncQueue.getWaiting(),
        this.syncQueue.getActive(),
      ]);
      queuedJobs = waiting.filter((j) => (j.data as SyncJobData).storeId === storeId).length;
      activeJobs = active.filter((j) => (j.data as SyncJobData).storeId === storeId).length;
    } catch (err) {
      this.logger.warn(`Queue inspection failed: ${(err as Error).message}`);
    }

    return {
      isConnected: conn?.isConnected ?? false,
      isAutoSync: conn?.isAutoSync ?? false,
      lastSyncAt: conn?.lastSyncAt,
      lastSyncStatus: conn?.lastSyncStatus,
      lastSyncError: conn?.lastSyncError,
      rateLimitRemaining: conn?.rateLimitRemaining,
      rateLimitDayRemaining: conn?.rateLimitDayRemaining,
      uzumShopId: conn?.uzumShopId,
      queuedJobs,
      activeJobs,
      recentLogs,
    };
  }
}
