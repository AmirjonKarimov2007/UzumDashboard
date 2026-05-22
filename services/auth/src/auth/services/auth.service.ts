import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { SessionService } from '../../sessions/sessions.service';
import { SmsService } from '../../sms/sms.service';
import {
  SendOtpDto,
  VerifyOtpDto,
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
    private smsService: SmsService,
  ) {}

  /**
   * Send OTP to phone number for login/registration
   */
  async sendOtp(dto: SendOtpDto): Promise<{ message: string; expiresAt: Date }> {
    const { phone } = dto;

    // Validate phone format (Uzbek format)
    const phoneRegex = /^\+998\d{9}$/;
    if (!phoneRegex.test(phone)) {
      throw new BadRequestException('Invalid phone number format. Use +998XXXXXXXXX');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { phone },
    });

    // Generate OTP
    const { code, expiresAt } = await this.otpService.generateOtp(phone, user?.id);

    // Send SMS
    try {
      await this.smsService.sendOtp(phone, code, user?.name ?? undefined);
    } catch (error) {
      console.error('Failed to send SMS:', error);
      // Don't fail OTP generation if SMS fails (for demo purposes)
    }

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'OTP_SENT',
        userId: user?.id,
        entity: 'User',
        entityId: user?.id,
        metadata: { phone },
      },
    });

    // In dev/console mode, return code so frontend can show it (no real SMS provider)
    const smsProvider = this.config.get<string>('SMS_PROVIDER') || 'console';
    const devCode = smsProvider === 'console' ? code : undefined;

    return {
      message: 'OTP sent successfully',
      expiresAt,
      ...(devCode ? { devCode, devMode: true } : {}),
    };
  }

  /**
   * Verify OTP and login/register user
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const { phone, code, device, ipAddress, userAgent } = dto;

    // Verify OTP
    const otpRecord = await this.otpService.verifyOtp(phone, code);

    // Get or create user
    let user = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          phone,
          isActive: true,
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Ensure user has at least one store (idempotent — runs for new AND existing users)
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

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Create session
    await this.sessionService.createSession({
      userId: user.id,
      token: refreshToken,
      device,
      ipAddress,
      userAgent,
    });

    // Save refresh token to database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            this.parseDuration(this.config.get<string>('jwt.refreshTokenExpiresIn') ?? '7d'),
        ),
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'USER_LOGGED_IN',
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        metadata: { phone, device },
      },
    });

    // Return user data with stores
    const userWithStores = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { stores: true },
    });

    return {
      user: {
        id: userWithStores!.id,
        phone: userWithStores!.phone,
        email: userWithStores!.email,
        name: userWithStores!.name,
        avatar: userWithStores!.avatar,
        stores: userWithStores!.stores,
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

    // Revoke old refresh token
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(tokenRecord.user);

    // Save new refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: tokenRecord.user.id,
        expiresAt: new Date(
          Date.now() +
            this.parseDuration(this.config.get<string>('jwt.refreshTokenExpiresIn') ?? '7d'),
        ),
      },
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
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

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
}