import { HttpException } from '@nestjs/common';
import { OtpService } from './otp.service';

describe('OtpService security', () => {
  const phone = '+998901234567';
  const config = { get: jest.fn((key: string) => key === 'OTP_SECRET' ? 'test-secret-that-is-not-used-in-production' : undefined) };

  it('generates a random six-digit code but stores only its HMAC hash', async () => {
    const prisma: any = {
      otp: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new OtpService(prisma, config as any);
    const result = await service.generateOtp(phone, 'user-1');

    expect(result.code).toMatch(/^\d{6}$/);
    expect(prisma.otp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone,
        userId: 'user-1',
        type: 'LOGIN',
        code: expect.stringMatching(/^[a-f0-9]{64}$/),
        maxAttempts: 5,
      }),
    });
    expect(prisma.otp.create.mock.calls[0][0].data.code).not.toBe(result.code);
  });

  it('enforces the one-minute resend cooldown', async () => {
    const now = new Date();
    const prisma: any = {
      otp: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ createdAt: now }),
      },
    };
    const service = new OtpService(prisma, config as any);
    await expect(service.generateOtp(phone, 'user-1')).rejects.toMatchObject({ status: 429 });
  });

  it('increments a wrong attempt and never consumes the code', async () => {
    const prisma: any = {
      otp: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new OtpService(prisma, config as any);
    prisma.otp.findFirst.mockResolvedValue({
      id: 'otp-1', phone, code: (service as any).hashCode(phone, '123456'),
      userId: 'user-1', verified: false, attempts: 0, maxAttempts: 5,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOtp(phone, '000000')).rejects.toThrow('4 ta urinish qoldi');
    expect(prisma.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { attempts: { increment: 1 } },
    }));
  });

  it('locks the OTP after the fifth wrong code', async () => {
    const prisma: any = {
      otp: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new OtpService(prisma, config as any);
    prisma.otp.findFirst.mockResolvedValue({
      id: 'otp-1', phone, code: (service as any).hashCode(phone, '123456'),
      userId: 'user-1', verified: false, attempts: 4, maxAttempts: 5,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    try {
      await service.verifyOtp(phone, '000000');
      throw new Error('expected OTP lockout');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(prisma.otp.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'otp-1' } }));
  });

  it('atomically consumes a valid code once', async () => {
    const prisma: any = {
      otp: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new OtpService(prisma, config as any);
    prisma.otp.findFirst.mockResolvedValue({
      id: 'otp-1', phone, code: (service as any).hashCode(phone, '123456'),
      userId: 'user-1', verified: false, attempts: 0, maxAttempts: 5,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOtp(phone, '123456')).resolves.toEqual({ verified: true, userId: 'user-1' });
    expect(prisma.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { verified: true } }));
  });
});
