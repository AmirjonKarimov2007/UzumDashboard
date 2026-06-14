import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate OTP for phone number
   */
  async generateOtp(phone: string, userId?: string): Promise<{
    code: string;
    expiresAt: Date;
  }> {
    // Generate 6-digit OTP
    const code = this.generateCode(6);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

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
        code: this.hashCode(code), // Store hashed code
        type: userId ? 'LOGIN' : 'PHONE_VERIFICATION',
        userId,
        expiresAt,
      },
    });

    return { code, expiresAt };
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
      throw new BadRequestException('Maximum attempts exceeded');
    }

    // Check code
    if (otpRecord.code !== this.hashCode(code)) {
      await this.prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 },
      });

      // Create audit log
      await this.prisma.auditLog.create({
        data: {
          action: 'OTP_FAILED',
          userId: otpRecord.userId,
          entity: 'Otp',
          entityId: otpRecord.id,
          metadata: { phone, attempt: otpRecord.attempts + 1 },
        },
      });

      throw new BadRequestException('Invalid OTP');
    }

    // Mark as verified
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

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

  /**
   * Generate random code (TEST MODE: always 555555)
   */
  private generateCode(length: number): string {
    return '555555'; // Test mode - fixed OTP
    // Production code (disabled):
    // const chars = '0123456789';
    // let result = '';
    // for (let i = 0; i < length; i++) {
    //   result += chars.charAt(Math.floor(Math.random() * chars.length));
    // }
    // return result;
  }

  /**
   * Simple hash for OTP (in production, use bcrypt)
   */
  private hashCode(code: string): string {
    return code; // For demo - in production, hash this!
  }
}