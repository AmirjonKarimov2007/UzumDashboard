import {
  Controller,
  Get,
  Delete,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/database/prisma.service';
import { TelegramBotService } from './telegram-bot.service';

@Controller('me/telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: TelegramBotService,
  ) {}

  @Get()
  async status(@Req() req: any) {
    const userId = req.user?.id as string;
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

  @Delete()
  async disconnect(@Req() req: any) {
    const userId = req.user?.id as string;
    const tu = await this.prisma.telegramUser.findUnique({
      where: { userId },
    });
    if (!tu) throw new NotFoundException('Telegram not connected');
    await this.prisma.telegramUser.delete({ where: { id: tu.id } });
    return { ok: true };
  }
}
