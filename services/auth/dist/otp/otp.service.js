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
exports.OtpService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/database/prisma.service");
let OtpService = class OtpService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async generateOtp(phone, userId) {
        const code = this.generateCode(6);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await this.prisma.otp.updateMany({
            where: {
                phone,
                verified: false,
            },
            data: {
                expiresAt: new Date(),
            },
        });
        await this.prisma.otp.create({
            data: {
                phone,
                code: this.hashCode(code),
                type: userId ? 'LOGIN' : 'PHONE_VERIFICATION',
                userId,
                expiresAt,
            },
        });
        return { code, expiresAt };
    }
    async verifyOtp(phone, code) {
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
            throw new common_1.BadRequestException('OTP not found or expired');
        }
        if (otpRecord.expiresAt < new Date()) {
            throw new common_1.BadRequestException('OTP has expired');
        }
        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            throw new common_1.BadRequestException('Maximum attempts exceeded');
        }
        if (otpRecord.code !== this.hashCode(code)) {
            await this.prisma.otp.update({
                where: { id: otpRecord.id },
                data: { attempts: otpRecord.attempts + 1 },
            });
            await this.prisma.auditLog.create({
                data: {
                    action: 'OTP_FAILED',
                    userId: otpRecord.userId,
                    entity: 'Otp',
                    entityId: otpRecord.id,
                    metadata: { phone, attempt: otpRecord.attempts + 1 },
                },
            });
            throw new common_1.BadRequestException('Invalid OTP');
        }
        await this.prisma.otp.update({
            where: { id: otpRecord.id },
            data: { verified: true },
        });
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
    generateCode(length) {
        const chars = '0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    hashCode(code) {
        return code;
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OtpService);
//# sourceMappingURL=otp.service.js.map