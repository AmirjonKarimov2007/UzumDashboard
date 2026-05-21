import { Module } from '@nestjs/common';
import { FinanceSyncService } from './finance-sync.service';
import { FinanceController } from './finance.controller';
import { UzumModule } from '../../uzum/uzum.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [DatabaseModule, UzumModule, AnalyticsModule],
  controllers: [FinanceController],
  providers: [FinanceSyncService],
  exports: [FinanceSyncService],
})
export class FinanceModule {}
