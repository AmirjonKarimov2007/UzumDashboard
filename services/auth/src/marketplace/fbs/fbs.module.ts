import { Module } from '@nestjs/common';
import { FbsController } from './fbs.controller';
import { FbsService } from './fbs.service';
import { UzumModule } from '../../uzum/uzum.module';
import { StoresModule } from '../stores/stores.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [UzumModule, StoresModule, FinanceModule],
  controllers: [FbsController],
  providers: [FbsService],
  exports: [FbsService],
})
export class FbsModule {}
