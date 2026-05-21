import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventorySyncService } from './inventory-sync.service';
import { UzumModule } from '../../uzum/uzum.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule, UzumModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventorySyncService],
  exports: [InventoryService, InventorySyncService],
})
export class InventoryModule {}
