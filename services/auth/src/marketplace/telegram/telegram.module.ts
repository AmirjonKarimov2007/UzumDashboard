import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramNotifyService } from './telegram-notify.service';
import { TelegramStatsService } from './telegram-stats.service';
import { TelegramOrderPoller } from './telegram-order-poller.service';
import { TelegramController } from './telegram.controller';
import { UzumModule } from '../../uzum/uzum.module';
import { FinanceModule } from '../finance/finance.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [UzumModule, FinanceModule, StoresModule],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramNotifyService,
    TelegramStatsService,
    TelegramOrderPoller,
  ],
  exports: [TelegramBotService, TelegramNotifyService],
})
export class TelegramModule {}
