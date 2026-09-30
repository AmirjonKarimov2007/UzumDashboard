import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class OtpService {
  private readonly codeTtlMs = 5 * 60 * 1000;
  private readonly resendCooldownMs = 60 * 1000;
  private readonly sendWindowMs = 15 * 60 * 1000;
  private readonly maxSendsPerWindow = 5;
  private readonly lockoutMs = 30 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Generate OTP for phone number
   */
  async generateOtp(phone: string, userId?: string): Promise<{
    code: string;
    expiresAt: Date;
    resendAfterSeconds: number;
  }> {
    const now = new Date();
    const lockedSince = new Date(now.getTime() - this.lockoutMs);
    const locked = await this.prisma.otp.findFirst({
      where: {
        phone,
        createdAt: { gte: lockedSince },
        attempts: { gte: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (locked) {
      const retryAfter = Math.max(
        1,
        Math.ceil((locked.createdAt.getTime() + this.lockoutMs - now.getTime()) / 1000),
      );
      throw this.tooMany(`Juda ko‘p noto‘g‘ri urinish. ${Math.ceil(retryAfter / 60)} daqiqadan keyin qayta urinib ko‘ring.`);
    }

    const latest = await this.prisma.otp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && now.getTime() - latest.createdAt.getTime() < this.resendCooldownMs) {
      const retryAfter = Math.ceil((latest.createdAt.getTime() + this.resendCooldownMs - now.getTime()) / 1000);
      throw this.tooMany(`Kod yaqinda yuborilgan. ${retryAfter} soniyadan keyin qayta yuboring.`);
    }

    const sentInWindow = await this.prisma.otp.count({
      where: {
        phone,
        createdAt: { gte: new Date(now.getTime() - this.sendWindowMs) },
      },
    });
    if (sentInWindow >= this.maxSendsPerWindow) {
      throw this.tooMany('Kod juda ko‘p so‘raldi. 15 daqiqadan keyin qayta urinib ko‘ring.');
    }

    const code = this.generateCode(6);
    const expiresAt = new Date(now.getTime() + this.codeTtlMs);

    // Revoke existing unverified OTPs for this phone
    await this.prisma.otp.updateMany({
      where: {
        phone,
        verified: false,
      },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });

    // Create new OTP record
    await this.prisma.otp.create({
      data: {
        phone,
        code: this.hashCode(phone, code),
        type: userId ? 'LOGIN' : 'PHONE_VERIFICATION',
        userId,
        expiresAt,
        maxAttempts: 5,
      },
    });

    return { code, expiresAt, resendAfterSeconds: this.resendCooldownMs / 1000 };
  }

  /**
   * Verify OTP
   */
  async verifyOtp(phone: string, code: string): Promise<{
    verified: boolean;
    userId?: string;
  }> {
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        phone,
        verified: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP not found or expired');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      throw this.tooMany('Juda ko‘p noto‘g‘ri urinish. 30 daqiqadan keyin qayta urinib ko‘ring.');
    }

    const valid = this.safeEqual(otpRecord.code, this.hashCode(phone, code));
    if (!valid) {
      const updated = await this.prisma.otp.updateMany({
        where: {
          id: otpRecord.id,
          verified: false,
          attempts: otpRecord.attempts,
        },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count !== 1) throw new BadRequestException('Kod holati o‘zgardi. Qayta urinib ko‘ring.');
      const attempt = otpRecord.attempts + 1;

      await this.prisma.auditLog.create({
        data: {
          action: 'OTP_FAILED',
          userId: otpRecord.userId,
          entity: 'Otp',
          entityId: otpRecord.id,
          metadata: { phone, attempt },
        },
      });

      if (attempt >= otpRecord.maxAttempts) {
        await this.prisma.otp.update({
          where: { id: otpRecord.id },
          data: { expiresAt: new Date() },
        });
        throw this.tooMany('Kod 5 marta noto‘g‘ri kiritildi. Akkaunt 30 daqiqaga himoyalandi.');
      }
      throw new BadRequestException(`Kod noto‘g‘ri. ${otpRecord.maxAttempts - attempt} ta urinish qoldi.`);
    }

    const consumed = await this.prisma.otp.updateMany({
      where: {
        id: otpRecord.id,
        verified: false,
        attempts: { lt: otpRecord.maxAttempts },
        expiresAt: { gt: new Date() },
      },
      data: { verified: true },
    });
    if (consumed.count !== 1) throw new BadRequestException('Kod avval ishlatilgan yoki muddati tugagan');

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'OTP_VERIFIED',
        userId: otpRecord.userId,
        entity: 'Otp',
        entityId: otpRecord.id,
        metadata: { phone },
      },
    });

    return {
      verified: true,
      userId: otpRecord.userId ?? undefined,
    };
  }

  private generateCode(length: number): string {
    const max = 10 ** length;
    return crypto.randomInt(0, max).toString().padStart(length, '0');
  }

  private hashCode(phone: string, code: string): string {
    const secret = this.config.get<string>('OTP_SECRET')
      || this.config.get<string>('JWT_SECRET')
      || 'development-otp-secret';
    return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  private tooMany(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
