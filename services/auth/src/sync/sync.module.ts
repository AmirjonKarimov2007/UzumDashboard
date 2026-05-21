import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncService, SYNC_QUEUE } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { SyncProcessor } from './processors/full-sync.processor';
import { StoresModule } from '../marketplace/stores/stores.module';
import { ProductsModule } from '../marketplace/products/products.module';
import { OrdersModule } from '../marketplace/orders/orders.module';
import { FinanceModule } from '../marketplace/finance/finance.module';
import { InventoryModule } from '../marketplace/inventory/inventory.module';
import { DatabaseModule } from '../common/database/database.module';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: SYNC_QUEUE }),
    StoresModule,
    ProductsModule,
    OrdersModule,
    FinanceModule,
    InventoryModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncProcessor, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
