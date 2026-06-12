"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramModule = void 0;
const common_1 = require("@nestjs/common");
const telegram_bot_service_1 = require("./telegram-bot.service");
const telegram_notify_service_1 = require("./telegram-notify.service");
const telegram_stats_service_1 = require("./telegram-stats.service");
const telegram_order_poller_service_1 = require("./telegram-order-poller.service");
const telegram_controller_1 = require("./telegram.controller");
const uzum_module_1 = require("../../uzum/uzum.module");
const finance_module_1 = require("../finance/finance.module");
const stores_module_1 = require("../stores/stores.module");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [uzum_module_1.UzumModule, finance_module_1.FinanceModule, stores_module_1.StoresModule],
        controllers: [telegram_controller_1.TelegramController],
        providers: [
            telegram_bot_service_1.TelegramBotService,
            telegram_notify_service_1.TelegramNotifyService,
            telegram_stats_service_1.TelegramStatsService,
            telegram_order_poller_service_1.TelegramOrderPoller,
        ],
        exports: [telegram_bot_service_1.TelegramBotService, telegram_notify_service_1.TelegramNotifyService],
    })
], TelegramModule);
//# sourceMappingURL=telegram.module.js.map