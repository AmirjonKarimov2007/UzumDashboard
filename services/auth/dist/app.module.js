"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const bullmq_1 = require("@nestjs/bullmq");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const otp_module_1 = require("./otp/otp.module");
const sessions_module_1 = require("./sessions/sessions.module");
const sms_module_1 = require("./sms/sms.module");
const database_module_1 = require("./common/database/database.module");
const redis_module_1 = require("./common/redis/redis.module");
const uzum_module_1 = require("./uzum/uzum.module");
const stores_module_1 = require("./marketplace/stores/stores.module");
const products_module_1 = require("./marketplace/products/products.module");
const orders_module_1 = require("./marketplace/orders/orders.module");
const finance_module_1 = require("./marketplace/finance/finance.module");
const analytics_module_1 = require("./marketplace/analytics/analytics.module");
const inventory_module_1 = require("./marketplace/inventory/inventory.module");
const fbs_module_1 = require("./marketplace/fbs/fbs.module");
const returns_module_1 = require("./marketplace/returns/returns.module");
const telegram_module_1 = require("./marketplace/telegram/telegram.module");
const sync_module_1 = require("./sync/sync.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '.env.development', '.env.production'],
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                useFactory: () => ({
                    throttlers: [{ ttl: 60000, limit: 100 }],
                }),
            }),
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.get('REDIS_HOST') || 'localhost',
                        port: parseInt(config.get('REDIS_PORT') || '6379'),
                        password: config.get('REDIS_PASSWORD') || undefined,
                    },
                }),
            }),
            database_module_1.DatabaseModule,
            redis_module_1.RedisModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            otp_module_1.OtpModule,
            sessions_module_1.SessionsModule,
            sms_module_1.SmsModule,
            uzum_module_1.UzumModule,
            stores_module_1.StoresModule,
            products_module_1.ProductsModule,
            orders_module_1.OrdersModule,
            finance_module_1.FinanceModule,
            analytics_module_1.AnalyticsModule,
            inventory_module_1.InventoryModule,
            fbs_module_1.FbsModule,
            returns_module_1.ReturnsModule,
            telegram_module_1.TelegramModule,
            sync_module_1.SyncModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map