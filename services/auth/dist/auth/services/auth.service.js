"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../common/database/prisma.service");
const otp_service_1 = require("../../otp/otp.service");
const sessions_service_1 = require("../../sessions/sessions.service");
const sms_service_1 = require("../../sms/sms.service");
let AuthService = class AuthService {
    constructor(prisma, jwtService, config, otpService, sessionService, smsService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
        this.otpService = otpService;
        this.sessionService = sessionService;
        this.smsService = smsService;
    }
    async sendOtp(dto) {
        const { phone } = dto;
        const phoneRegex = /^\+998\d{9}$/;
        if (!phoneRegex.test(phone)) {
            throw new common_1.BadRequestException('Invalid phone number format. Use +998XXXXXXXXX');
        }
        const user = await this.prisma.user.findUnique({
            where: { phone },
        });
        const { code, expiresAt } = await this.otpService.generateOtp(phone, user?.id);
        try {
            await this.smsService.sendOtp(phone, code, user?.name ?? undefined);
        }
        catch (error) {
            console.error('Failed to send SMS:', error);
        }
        await this.prisma.auditLog.create({
            data: {
                action: 'OTP_SENT',
                userId: user?.id,
                entity: 'User',
                entityId: user?.id,
                metadata: { phone },
            },
        });
        const smsProvider = this.config.get('SMS_PROVIDER') || 'console';
        const devCode = smsProvider === 'console' ? code : undefined;
        return {
            message: 'OTP sent successfully',
            expiresAt,
            ...(devCode ? { devCode, devMode: true } : {}),
        };
    }
    async verifyOtp(dto) {
        const { phone, code, device, ipAddress, userAgent } = dto;
        const otpRecord = await this.otpService.verifyOtp(phone, code);
        let user = await this.prisma.user.findUnique({
            where: { phone },
        });
        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    phone,
                    isActive: true,
                },
            });
        }
        if (!user.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
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
        const { accessToken, refreshToken } = await this.generateTokens(user);
        await this.sessionService.createSession({
            userId: user.id,
            token: refreshToken,
            device,
            ipAddress,
            userAgent,
        });
        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() +
                    this.parseDuration(this.config.get('jwt.refreshTokenExpiresIn') ?? '7d')),
            },
        });
        await this.prisma.auditLog.create({
            data: {
                action: 'USER_LOGGED_IN',
                userId: user.id,
                entity: 'User',
                entityId: user.id,
                metadata: { phone, device },
            },
        });
        const userWithStores = await this.prisma.user.findUnique({
            where: { id: user.id },
            include: { stores: true },
        });
        return {
            user: {
                id: userWithStores.id,
                phone: userWithStores.phone,
                email: userWithStores.email,
                name: userWithStores.name,
                avatar: userWithStores.avatar,
                stores: userWithStores.stores,
            },
            accessToken,
            refreshToken,
        };
    }
    async refreshToken(dto) {
        const { refreshToken } = dto;
        const tokenRecord = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });
        if (!tokenRecord || tokenRecord.revoked) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (tokenRecord.expiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        if (!tokenRecord.user.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
        }
        await this.prisma.refreshToken.update({
            where: { id: tokenRecord.id },
            data: { revoked: true },
        });
        const tokens = await this.generateTokens(tokenRecord.user);
        await this.prisma.refreshToken.create({
            data: {
                token: tokens.refreshToken,
                userId: tokenRecord.user.id,
                expiresAt: new Date(Date.now() +
                    this.parseDuration(this.config.get('jwt.refreshTokenExpiresIn') ?? '7d')),
            },
        });
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
    async logout(dto) {
        const { refreshToken, userId } = dto;
        await this.prisma.refreshToken.updateMany({
            where: {
                token: refreshToken,
                userId,
                revoked: false,
            },
            data: { revoked: true },
        });
        await this.sessionService.deleteSession(refreshToken);
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
    async logoutAll(userId) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revoked: false },
            data: { revoked: true },
        });
        await this.sessionService.deleteAllSessions(userId);
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
    async validateToken(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { stores: true },
        });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        return {
            id: user.id,
            phone: user.phone,
            name: user.name,
            avatar: user.avatar,
            stores: user.stores,
        };
    }
    async generateTokens(user) {
        const payload = {
            sub: user.id,
            phone: user.phone,
            name: user.name,
        };
        const accessToken = await this.jwtService.signAsync(payload);
        const refreshToken = this.generateRandomToken();
        return { accessToken, refreshToken };
    }
    generateRandomToken() {
        return (Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15));
    }
    parseDuration(duration) {
        const match = duration.match(/^(\d+)([smhd])$/);
        if (!match)
            return 7 * 24 * 60 * 60 * 1000;
        const value = parseInt(match[1], 10);
        const unit = match[2];
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
        };
        return value * (multipliers[unit] || 1);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        otp_service_1.OtpService,
        sessions_service_1.SessionService,
        sms_service_1.SmsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map