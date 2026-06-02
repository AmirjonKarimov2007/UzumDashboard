import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsSyncService } from './products-sync.service';
import { ProductMetaController } from './product-meta.controller';
import { ProductMetaService } from './product-meta.service';
import { UzumModule } from '../../uzum/uzum.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule, UzumModule],
  controllers: [ProductsController, ProductMetaController],
  providers: [ProductsService, ProductsSyncService, ProductMetaService],
  exports: [ProductsService, ProductsSyncService],
})
export class ProductsModule {}
