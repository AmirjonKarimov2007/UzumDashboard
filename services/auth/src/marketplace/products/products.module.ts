import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsSyncService } from './products-sync.service';
import { UzumModule } from '../../uzum/uzum.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule, UzumModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsSyncService],
  exports: [ProductsService, ProductsSyncService],
})
export class ProductsModule {}
