"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const prisma_service_1 = require("../../common/database/prisma.service");
const telegram_bot_service_1 = require("./telegram-bot.service");
let TelegramController = class TelegramController {
    constructor(prisma, botService) {
        this.prisma = prisma;
        this.botService = botService;
    }
    async status(req) {
        const userId = req.user?.id;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId },
            select: {
                chatId: true,
                username: true,
                firstName: true,
                lastName: true,
                notifyOrders: true,
                isActive: true,
                createdAt: true,
            },
        });
        const username = this.botService.getBotUsername();
        return {
            botUsername: username,
            botUrl: username ? `https://t.me/${username}` : null,
            connected: !!tu && tu.isActive,
            telegram: tu,
        };
    }
    async disconnect(req) {
        const userId = req.user?.id;
        const tu = await this.prisma.telegramUser.findUnique({
            where: { userId },
        });
        if (!tu)
            throw new common_1.NotFoundException('Telegram not connected');
        await this.prisma.telegramUser.delete({ where: { id: tu.id } });
        return { ok: true };
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "status", null);
__decorate([
    (0, common_1.Delete)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('me/telegram'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_bot_service_1.TelegramBotService])
], TelegramController);
//# sourceMappingURL=telegram.controller.js.map