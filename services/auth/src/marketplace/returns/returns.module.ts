import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { UzumModule } from '../../uzum/uzum.module';
import { StoresModule } from '../stores/stores.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [UzumModule, StoresModule, FinanceModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
