import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/database/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { SessionService } from '../../sessions/sessions.service';
import { TelegramBotService } from '../../marketplace/telegram/telegram-bot.service';
import {
  SendOtpDto,
  VerifyOtpDto,
  TelegramLoginDto,
  TelegramWidgetLoginDto,
  PasswordLoginDto,
  RefreshTokenDto,
  LogoutDto,
} from '../dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
    private sessionService: SessionService,
    private telegramBot: TelegramBotService,
  ) {}

  /**
   * Send a Telegram OTP to an existing account
   */
  async sendOtp(dto: SendOtpDto): Promise<{
    message: string;
    expiresAt: Date;
    resendAfterSeconds: number;
    devCode?: string;
    devMode?: boolean;
  }> {
    const phone = this.normalizePhone(dto.phone);
    const localConsoleOtp =
      this.config.get<string>('NODE_ENV') === 'development' &&
      this.config.get<string>('SMS_PROVIDER') === 'console';

    // Validate phone format (Uzbek format)
    const phoneRegex = /^\+998\d{9}$/;
    if (!phoneRegex.test(phone)) {
      throw new BadRequestException('Invalid phone number format. Use +998XXXXXXXXX');
    }

    const user = await this.prisma.user.findFirst({
      where: { phone: { in: this.phoneCandidates(phone) } },
      include: { telegramUser: true },
    });
    if (!user) throw new NotFoundException('Bunday account mavjud emas');
    if (!user.isActive) throw new UnauthorizedException('Account bloklangan');
    if (!localConsoleOtp && (!user.telegramUser?.isActive || !user.telegramUser.chatId)) {
      throw new BadRequestException('Bu accountga Telegram raqami ulanmagan');
    }

    const { code, expiresAt, resendAfterSeconds } = await this.otpService.generateOtp(phone, user.id);

    if (!localConsoleOtp) {
      try {
        await this.telegramBot.sendLoginCode(user.telegramUser!.chatId, code, expiresAt);
      } catch (error) {
        await this.prisma.otp.updateMany({
          where: { phone, verified: false },
          data: { expiresAt: new Date() },
        });
        throw new BadRequestException('Telegramga kod yuborib bo‘lmadi. Bot bloklanmaganini tekshiring.');
      }
    }

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'OTP_SENT',
        userId: user?.id,
        entity: 'User',
        entityId: user?.id,
        metadata: { phone, channel: localConsoleOtp ? 'development-console' : 'telegram' },
      },
    });

    return {
      message: localConsoleOtp
        ? 'Lokal test kodi yaratildi'
        : 'Kirish kodi Telegramga yuborildi',
      expiresAt,
      resendAfterSeconds,
      ...(localConsoleOtp ? { devCode: code, devMode: true } : {}),
    };
  }

  /**
   * Verify OTP and log in an existing user
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const phone = this.normalizePhone(dto.phone);
    const { code, device, ipAddress, userAgent } = dto;

    // Verify OTP
    const otpRecord = await this.otpService.verifyOtp(phone, code);

    const user = otpRecord.userId
      ? await this.prisma.user.findUnique({ where: { id: otpRecord.userId } })
      : await this.prisma.user.findFirst({
        where: { phone: { in: this.phoneCandidates(phone) } },
      });

    if (!user) {
      throw new NotFoundException('Bunday account mavjud emas');
    }

    if (!this.phoneCandidates(phone).includes(user.phone)) {
      throw new UnauthorizedException('Kod boshqa account uchun yaratilgan');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account bloklangan');
    }

    const storeCount = await this.prisma.store.count({ where: { userId: user.id } });
    if (storeCount === 0) {
      await this.prisma.store.create({
        data: {
          userId: user.id,
          name: "Mening do'konim",
          plan: 'FREE',
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_IN',
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        metadata: { phone, device, via: 'telegram_otp' },
      },
    });
    return this.finalizeLogin(user.id, { device, ipAddress, userAgent });
  }

  /**
   * Telegram WebApp orqali login — parol/OTP so'ramaydi.
   * WebApp'dan kelgan `initData` HMAC bilan tekshiriladi, telegram user id
   * orqali bog'langan akkaunt topiladi (bot'da telefon ulashgan bo'lsa) va
   * to'g'ridan-to'g'ri token beriladi.
   */
  async loginWithTelegram(dto: TelegramLoginDto): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const tgUser = this.validateTelegramInitData(dto.initData);
    if (!tgUser?.id) {
      throw new UnauthorizedException('Telegram maʼlumotlari notoʻgʻri');
    }

    // Bot'da telefon ulashganda saqlangan bog'lanish (chatId === telegram user id)
    let link = await this.prisma.telegramUser.findFirst({
      where: { chatId: String(tgUser.id), isActive: true },
      include: { user: true },
    });

    // Bog'lanish yo'q bo'lsa — egasi (admin yoki yagona foydalanuvchi) uchun
    // hech narsa so'ramasdan avtomatik bog'laymiz. Noma'lum foydalanuvchi uchun
    // (ko'p-foydalanuvchili tizimda) telefon orqali kirishga qaytaramiz.
    if (!link) {
      const ownerId = await this.resolveTelegramOwner(tgUser);
      if (!ownerId) {
        throw new NotFoundException('telegram_not_linked');
      }
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
      await this.prisma.telegramUser.upsert({
        where: { userId: ownerId },
        create: {
          userId: ownerId,
          chatId: String(tgUser.id),
          phone: owner?.phone ?? `tg:${tgUser.id}`,
          username: tgUser.username ?? null,
          firstName: tgUser.first_name ?? null,
          lastName: tgUser.last_name ?? null,
        },
        update: {
          chatId: String(tgUser.id),
          isActive: true,
          username: tgUser.username ?? null,
          firstName: tgUser.first_name ?? null,
          lastName: tgUser.last_name ?? null,
        },
      });
      link = await this.prisma.telegramUser.findFirst({
        where: { userId: ownerId },
        include: { user: true },
      });
    }

    if (!link || !link.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Kamida bitta do'kon bo'lsin (idempotent)
    const storeCount = await this.prisma.store.count({ where: { userId: link.userId } });
    if (storeCount === 0) {
      await this.prisma.store.create({
        data: { userId: link.userId, name: "Mening do'konim", plan: 'FREE', status: 'ACTIVE' },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_IN',
        userId: link.userId,
        entity: 'User',
        entityId: link.userId,
        metadata: { via: 'telegram', telegramId: String(tgUser.id) },
      },
    });

    return this.finalizeLogin(link.userId, {
      device: dto.device ?? { type: 'telegram' },
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });
  }

  /** Telegram Login Widget orqali oddiy brauzerdan kirish. Telegram imzosi
   * serverda tekshiriladi; faqat botda kontaktini ulagan akkauntlar kiradi. */
  async loginWithTelegramWidget(dto: TelegramWidgetLoginDto): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!this.validateTelegramWidgetData(dto)) {
      throw new UnauthorizedException('Telegram tasdiqlashi yaroqsiz yoki eskirgan');
    }
    const telegramId = String(dto.id);
    const link = await this.prisma.telegramUser.findFirst({
      where: { chatId: telegramId, isActive: true },
      include: { user: true },
    });
    if (!link) throw new NotFoundException('telegram_not_linked');
    if (!link.user.isActive) throw new UnauthorizedException('Account is deactivated');

    await this.prisma.telegramUser.update({
      where: { id: link.id },
      data: {
        username: dto.username ?? null,
        firstName: dto.first_name,
        lastName: dto.last_name ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_IN',
        userId: link.userId,
        entity: 'User',
        entityId: link.userId,
        metadata: { via: 'telegram_widget', telegramId },
      },
    });
    return this.finalizeLogin(link.userId, { device: { type: 'telegram-widget' } });
  }

  /** Super-admin o‘rnatgan parol bilan zaxira kirish. Yangi akkaunt bu endpoint
   * orqali ochilmaydi — ro‘yxatdan o‘tish Telegram botda tasdiqlanadi. */
  async loginWithPassword(dto: PasswordLoginDto): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const digits = dto.phone.replace(/\D/g, '');
    const candidates = [...new Set([dto.phone.trim(), digits, digits ? `+${digits}` : ''].filter(Boolean))];
    const user = await this.prisma.user.findFirst({ where: { phone: { in: candidates } } });
    if (!user?.password || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Telefon yoki parol noto‘g‘ri');
    }
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_IN',
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        metadata: { via: 'password' },
      },
    });
    return this.finalizeLogin(user.id, { device: { type: 'password' } });
  }

  /**
   * Telegram WebApp orqali kirgan foydalanuvchi qaysi akkauntga ulanishini
   * aniqlaydi (telefon so'ramasdan):
   *  - TELEGRAM_ADMIN_ID bilan mos kelsa → egasi akkaunti (do'koni bor eng eski
   *    foydalanuvchi, bo'lmasa eng eski, bo'lmasa yangi akkaunt yaratiladi);
   *  - yagona akkaunt bo‘lsa ham noma’lum Telegram foydalanuvchi telefonini tasdiqlaydi;
   *  - aks holda null (noma'lum foydalanuvchi → telefon orqali kirish).
   */
  private async resolveTelegramOwner(tgUser: any): Promise<string | null> {
    const adminId =
      this.config.get<string>('TELEGRAM_ADMIN_ID') || process.env.TELEGRAM_ADMIN_ID;
    const isAdmin = !!adminId && String(tgUser.id) === String(adminId);

    if (isAdmin) {
      const withStore = await this.prisma.user.findFirst({
        where: { stores: { some: {} } },
        orderBy: { createdAt: 'asc' },
      });
      if (withStore) return withStore.id;
      const earliest = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
      if (earliest) return earliest.id;
      const created = await this.createTelegramOwner(tgUser);
      return created.id;
    }

    // An unlinked Telegram identity must verify a phone even in a single-user
    // deployment. Otherwise anyone could sign into the super-admin account.
    return null;
  }

  /** Telegram identifikatori asosida yangi egasi akkaunti + do'kon yaratadi
   *  (bo'sh bazada admin birinchi marta kirganda). Telefon placeholder: tg:<id>. */
  private async createTelegramOwner(tgUser: any) {
    const name =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
      tgUser.username ||
      'Telegram foydalanuvchi';
    return this.prisma.user.create({
      data: {
        phone: `tg:${tgUser.id}`,
        name,
        isActive: true,
        stores: {
          create: { name: "Mening do'konim", plan: 'FREE', status: 'ACTIVE' },
        },
      },
    });
  }

  /** initData HMAC tekshiruvi (Telegram WebApp). To'g'ri bo'lsa user obyektini
   *  qaytaradi, aks holda null. */
  private validateTelegramInitData(initData: string): any | null {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !initData) return null;
    try {
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) return null;
      params.delete('hash');
      const dataCheckString = [...params.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      if (computed !== hash) return null;
      // 24 soatdan eski initData'ni rad etamiz (replay himoyasi)
      const authDate = Number(params.get('auth_date') || 0);
      if (authDate && Date.now() / 1000 - authDate > 86_400) return null;
      const userJson = params.get('user');
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  }

  private validateTelegramWidgetData(dto: TelegramWidgetLoginDto): boolean {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !dto.hash || !dto.auth_date) return false;
    if (Math.abs(Date.now() / 1000 - dto.auth_date) > 86_400) return false;
    const fields: Record<string, string | number | undefined> = {
      auth_date: dto.auth_date,
      first_name: dto.first_name,
      id: dto.id,
      last_name: dto.last_name,
      photo_url: dto.photo_url,
      username: dto.username,
    };
    const dataCheckString = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
    let received: Buffer;
    try { received = Buffer.from(dto.hash, 'hex'); } catch { return false; }
    return received.length === computed.length && crypto.timingSafeEqual(received, computed);
  }

  /** Token + sessiya + refresh-token yaratib, to'liq login javobini qaytaradi
   *  (verifyOtp va loginWithTelegram uchun umumiy). */
  private async finalizeLogin(
    userId: string,
    meta: { device?: any; ipAddress?: string; userAgent?: string },
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stores: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const { accessToken, refreshToken } = await this.generateTokens(user);

    await this.sessionService.createSession({
      userId: user.id,
      token: refreshToken,
      device: meta.device,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        stores: user.stores,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(dto: RefreshTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const { refreshToken } = dto;

    // Verify refresh token
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.revoked) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!tokenRecord.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const previousSession = await this.sessionService.getSession(refreshToken);
    const tokens = await this.generateTokens(tokenRecord.user);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id: tokenRecord.id }, data: { revoked: true } }),
      this.prisma.refreshToken.create({
        data: { token: tokens.refreshToken, userId: tokenRecord.user.id, expiresAt: this.refreshExpiryDate() },
      }),
    ]);
    await this.sessionService.deleteSession(refreshToken);
    await this.sessionService.createSession({
      userId: tokenRecord.user.id,
      token: tokens.refreshToken,
      device: previousSession?.device,
      ipAddress: previousSession?.ipAddress,
      userAgent: previousSession?.userAgent,
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'TOKEN_REFRESHED',
        userId: tokenRecord.user.id,
        entity: 'User',
        entityId: tokenRecord.user.id,
      },
    });

    return tokens;
  }

  /**
   * Logout user - revoke refresh token
   */
  async logout(dto: LogoutDto): Promise<{ message: string }> {
    const { refreshToken, userId } = dto;

    // Revoke refresh token
    await this.prisma.refreshToken.updateMany({
      where: {
        token: refreshToken,
        userId,
        revoked: false,
      },
      data: { revoked: true },
    });

    // Delete session
    await this.sessionService.deleteSession(refreshToken);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_OUT',
        userId,
        entity: 'User',
        entityId: userId,
      },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<{ message: string }> {
    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    // Delete all sessions
    await this.sessionService.deleteAllSessions(userId);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_OUT',
        userId,
        entity: 'User',
        entityId: userId,
        metadata: { allDevices: true },
      },
    });

    return { message: 'Logged out from all devices' };
  }

  /**
   * Validate JWT token and return user
   */
  async validateToken(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stores: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatar: user.avatar,
      stores: user.stores,
    };
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: any): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      phone: user.phone,
      name: user.name,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = this.generateRandomToken();

    return { accessToken, refreshToken };
  }

  /**
   * Generate random refresh token
   */
  private generateRandomToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  private refreshExpiryDate(): Date {
    const configured = this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN')
      || this.config.get<string>('jwt.refreshTokenExpiresIn')
      || '365d';
    return new Date(Date.now() + this.parseDuration(configured));
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 365 * 24 * 60 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit as keyof typeof multipliers] || 1);
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('998') ? `+${digits}` : value.trim();
  }

  private phoneCandidates(value: string): string[] {
    const digits = value.replace(/\D/g, '');
    return [...new Set([value.trim(), digits, digits ? `+${digits}` : ''].filter(Boolean))];
  }
}
