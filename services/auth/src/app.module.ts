import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OtpModule } from './otp/otp.module';
import { SessionsModule } from './sessions/sessions.module';
import { SmsModule } from './sms/sms.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { UzumModule } from './uzum/uzum.module';
import { StoresModule } from './marketplace/stores/stores.module';
import { ProductsModule } from './marketplace/products/products.module';
import { OrdersModule } from './marketplace/orders/orders.module';
import { FinanceModule } from './marketplace/finance/finance.module';
import { AnalyticsModule } from './marketplace/analytics/analytics.module';
import { InventoryModule } from './marketplace/inventory/inventory.module';
import { FbsModule } from './marketplace/fbs/fbs.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development', '.env.production'],
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(config.get<string>('REDIS_PORT') || '6379'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    OtpModule,
    SessionsModule,
    SmsModule,
    UzumModule,
    StoresModule,
    ProductsModule,
    OrdersModule,
    FinanceModule,
    AnalyticsModule,
    InventoryModule,
    FbsModule,
    SyncModule,
  ],
})
export class AppModule {}
