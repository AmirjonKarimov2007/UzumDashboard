import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { UzumModule } from '../../uzum/uzum.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule, UzumModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersSyncService],
  exports: [OrdersService, OrdersSyncService],
})
export class OrdersModule {}
