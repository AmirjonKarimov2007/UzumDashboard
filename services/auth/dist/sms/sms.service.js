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
var SmsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let SmsService = SmsService_1 = class SmsService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(SmsService_1.name);
    }
    async sendOtp(phone, code, name) {
        const provider = this.config.get('SMS_PROVIDER') || 'console';
        this.logger.log(`📱 OTP for ${phone}: ${code}`);
        if (provider === 'eskiz') {
            await this.sendViaEskiz(phone, code);
        }
        else if (provider === 'twilio') {
            await this.sendViaTwilio(phone, code, name);
        }
    }
    async sendViaEskiz(phone, code) {
        const email = this.config.get('ESKIZ_EMAIL');
        const password = this.config.get('ESKIZ_PASSWORD');
        if (!email || !password) {
            this.logger.error('ESKIZ_EMAIL yoki ESKIZ_PASSWORD sozlanmagan');
            return;
        }
        try {
            const authRes = await axios_1.default.post('https://notify.eskiz.uz/api/auth/login', {
                email,
                password,
            });
            const token = authRes.data?.data?.token;
            if (!token)
                throw new Error('Eskiz token olinmadi');
            const cleanPhone = phone.replace(/\D/g, '').replace(/^998/, '998');
            await axios_1.default.post('https://notify.eskiz.uz/api/message/sms/send', {
                mobile_phone: cleanPhone,
                message: `Uzum Dashboard tasdiqlash kodi: ${code}`,
                from: '4546',
            }, { headers: { Authorization: `Bearer ${token}` } });
            this.logger.log(`Eskiz SMS yuborildi: ${phone}`);
        }
        catch (err) {
            this.logger.error(`Eskiz SMS xatosi: ${err?.message}`);
        }
    }
    async sendViaTwilio(phone, code, name) {
        const accountSid = this.config.get('SMS_TWILIO_ACCOUNT_SID');
        const authToken = this.config.get('SMS_TWILIO_AUTH_TOKEN');
        const fromNumber = this.config.get('SMS_TWILIO_PHONE_NUMBER');
        if (!accountSid || !authToken || !fromNumber) {
            this.logger.error('Twilio sozlamalari to\'liq emas');
            return;
        }
        try {
            const twilio = require('twilio');
            const client = twilio(accountSid, authToken);
            await client.messages.create({
                body: name
                    ? `${name}, Uzum Dashboard kodi: ${code}`
                    : `Uzum Dashboard tasdiqlash kodi: ${code}`,
                from: fromNumber,
                to: phone,
            });
        }
        catch (err) {
            this.logger.error(`Twilio xatosi: ${err?.message}`);
        }
    }
};
exports.SmsService = SmsService;
exports.SmsService = SmsService = SmsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SmsService);
//# sourceMappingURL=sms.service.js.map