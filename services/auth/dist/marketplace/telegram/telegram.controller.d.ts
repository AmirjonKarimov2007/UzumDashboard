import { PrismaService } from '../../common/database/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
export declare class TelegramController {
    private readonly prisma;
    private readonly botService;
    constructor(prisma: PrismaService, botService: TelegramBotService);
    status(req: any): Promise<{
        botUsername: string | null;
        botUrl: string | null;
        connected: boolean;
        telegram: {
            createdAt: Date;
            isActive: boolean;
            chatId: string;
            username: string | null;
            firstName: string | null;
            lastName: string | null;
            notifyOrders: boolean;
        } | null;
    }>;
    disconnect(req: any): Promise<{
        ok: boolean;
    }>;
}
