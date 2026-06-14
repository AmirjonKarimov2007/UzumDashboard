import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { SessionService } from '../../sessions/sessions.service';
import { SmsService } from '../../sms/sms.service';
import { SendOtpDto, VerifyOtpDto, TelegramLoginDto, RefreshTokenDto, LogoutDto } from '../dto/auth.dto';
export declare class AuthService {
    private prisma;
    private jwtService;
    private config;
    private otpService;
    private sessionService;
    private smsService;
    constructor(prisma: PrismaService, jwtService: JwtService, config: ConfigService, otpService: OtpService, sessionService: SessionService, smsService: SmsService);
    sendOtp(dto: SendOtpDto): Promise<{
        message: string;
        expiresAt: Date;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        user: any;
        accessToken: string;
        refreshToken: string;
    }>;
    loginWithTelegram(dto: TelegramLoginDto): Promise<{
        user: any;
        accessToken: string;
        refreshToken: string;
    }>;
    private validateTelegramInitData;
    private finalizeLogin;
    refreshToken(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(dto: LogoutDto): Promise<{
        message: string;
    }>;
    logoutAll(userId: string): Promise<{
        message: string;
    }>;
    validateToken(userId: string): Promise<any>;
    private generateTokens;
    private generateRandomToken;
    private parseDuration;
}
