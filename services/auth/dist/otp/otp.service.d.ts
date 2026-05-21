import { PrismaService } from '../common/database/prisma.service';
export declare class OtpService {
    private prisma;
    constructor(prisma: PrismaService);
    generateOtp(phone: string, userId?: string): Promise<{
        code: string;
        expiresAt: Date;
    }>;
    verifyOtp(phone: string, code: string): Promise<{
        verified: boolean;
        userId?: string;
    }>;
    private generateCode;
    private hashCode;
}
