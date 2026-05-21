import { Module } from '@nestjs/common';
import { UzumApiClient } from './client/uzum-api.client';
import { DatabaseModule } from '../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [UzumApiClient],
  exports: [UzumApiClient],
})
export class UzumModule {}
