import * as crypto from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService Telegram browser login', () => {
  const botToken = '123456:test-token';

  function fixture() {
    const user = { id: 'user-1', phone: '+998901234567', name: 'Ali', email: null, avatar: null, isActive: true, stores: [{ id: 'store-1' }] };
    const prisma: any = {
      telegramUser: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tg-row', userId: user.id, user }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access') };
    const config = { get: jest.fn((key: string) => key === 'TELEGRAM_BOT_TOKEN' ? botToken : key === 'REFRESH_TOKEN_EXPIRES_IN' ? '90d' : undefined) };
    const sessions = { createSession: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(prisma, jwt as any, config as any, {} as any, sessions as any, {} as any);
    return { service, prisma, sessions };
  }

  function signedWidgetPayload(overrides: Record<string, any> = {}) {
    const payload: Record<string, any> = {
      id: 123456,
      first_name: 'Ali',
      username: 'ali_user',
      auth_date: Math.floor(Date.now() / 1000),
      ...overrides,
    };
    const check = Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    payload.hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
    return payload;
  }

  it('accepts a valid Telegram signature and creates a 90-day refresh session', async () => {
    const { service, prisma, sessions } = fixture();
    const result = await service.loginWithTelegramWidget(signedWidgetPayload() as any);
    expect(result).toMatchObject({ accessToken: 'access', user: { id: 'user-1' } });
    expect(prisma.telegramUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { chatId: '123456', isActive: true } }));
    expect(prisma.refreshToken.create.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
    expect(sessions.createSession).toHaveBeenCalled();
  });

  it('rejects tampered and stale Telegram payloads', async () => {
    const { service, prisma } = fixture();
    const tampered = signedWidgetPayload();
    tampered.first_name = 'Changed';
    await expect(service.loginWithTelegramWidget(tampered as any)).rejects.toThrow('yaroqsiz');
    await expect(service.loginWithTelegramWidget(signedWidgetPayload({ auth_date: Math.floor(Date.now() / 1000) - 90_000 }) as any)).rejects.toThrow('yaroqsiz');
    expect(prisma.telegramUser.findFirst).not.toHaveBeenCalled();
  });
});

describe('AuthService phone to Telegram OTP login', () => {
  function fixture(existing = true, developmentConsole = false) {
    const user = {
      id: 'user-1', phone: '+998901234567', name: 'Ali', email: null,
      avatar: null, isActive: true, stores: [{ id: 'store-1' }],
      telegramUser: { chatId: '777', isActive: true },
    };
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(existing ? user : null),
        findUnique: jest.fn().mockResolvedValue(user),
        create: jest.fn(),
      },
      store: { count: jest.fn().mockResolvedValue(1), create: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
      otp: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const otp = {
      generateOtp: jest.fn().mockResolvedValue({
        code: '384921', expiresAt: new Date(Date.now() + 300_000), resendAfterSeconds: 60,
      }),
      verifyOtp: jest.fn().mockResolvedValue({ verified: true, userId: 'user-1' }),
    };
    const telegram = { sendLoginCode: jest.fn().mockResolvedValue(undefined) };
    const sessions = { createSession: jest.fn().mockResolvedValue(undefined) };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'REFRESH_TOKEN_EXPIRES_IN') return '180d';
        if (developmentConsole && key === 'NODE_ENV') return 'development';
        if (developmentConsole && key === 'SMS_PROVIDER') return 'console';
        return undefined;
      }),
    };
    const service = new AuthService(prisma, jwt as any, config as any, otp as any, sessions as any, telegram as any);
    return { service, prisma, otp, telegram, user };
  }

  it('sends a code to the Telegram chat linked to an existing phone', async () => {
    const { service, otp, telegram } = fixture();
    const result = await service.sendOtp({ phone: '+998901234567' });
    expect(otp.generateOtp).toHaveBeenCalledWith('+998901234567', 'user-1');
    expect(telegram.sendLoginCode).toHaveBeenCalledWith('777', '384921', expect.any(Date));
    expect(result).not.toHaveProperty('code');
    expect(result.message).toContain('Telegramga');
  });

  it('returns the code locally without requiring or calling Telegram in explicit console development mode', async () => {
    const { service, telegram, user } = fixture(true, true);
    user.telegramUser = null as any;
    const result = await service.sendOtp({ phone: '+998901234567' });
    expect(telegram.sendLoginCode).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      devMode: true,
      devCode: '384921',
      message: 'Lokal test kodi yaratildi',
    });
  });

  it('reports that an unknown account does not exist and sends nothing', async () => {
    const { service, otp, telegram } = fixture(false);
    await expect(service.sendOtp({ phone: '+998909999999' })).rejects.toThrow('account mavjud emas');
    expect(otp.generateOtp).not.toHaveBeenCalled();
    expect(telegram.sendLoginCode).not.toHaveBeenCalled();
  });

  it('logs in an existing user after a valid code without registering a new account', async () => {
    const { service, prisma, otp } = fixture();
    const result = await service.verifyOtp({ phone: '+998901234567', code: '384921' });
    expect(otp.verifyOtp).toHaveBeenCalledWith('+998901234567', '384921');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: 'user-1' } });
  });
});
