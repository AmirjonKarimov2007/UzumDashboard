import { TelegramBotService } from './telegram-bot.service';

describe('TelegramBotService registration', () => {
  it('creates a user, first store and Telegram link after own contact is shared', async () => {
    const createdUser = { id: 'new-user', phone: '+998901234567', name: 'Ali Valiyev', isActive: true };
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      telegramUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      store: { count: jest.fn(), create: jest.fn() },
    };
    const service = new TelegramBotService(
      { get: jest.fn() } as any,
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'showHome').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'notifyAdminNewLink').mockResolvedValue(undefined);
    const ctx: any = {
      from: { id: 777, first_name: 'Ali', last_name: 'Valiyev', username: 'ali' },
      chat: { id: 777 },
      message: { contact: { user_id: 777, phone_number: '998901234567' } },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (service as any).handleContact(ctx);

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phone: '+998901234567',
        stores: { create: expect.objectContaining({ name: "Mening do'konim" }) },
      }),
    }));
    expect(prisma.telegramUser.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'new-user', chatId: '777' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'USER_REGISTERED', userId: 'new-user' }),
    }));
  });

  it('sends the website login code only to the linked Telegram chat', async () => {
    const service = new TelegramBotService(
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    (service as any).bot = { telegram: { sendMessage } };

    await service.sendLoginCode('777', '384921', new Date(Date.now() + 5 * 60_000));

    expect(sendMessage).toHaveBeenCalledWith(
      '777',
      expect.stringContaining('384921'),
      { parse_mode: 'HTML' },
    );
  });
});
