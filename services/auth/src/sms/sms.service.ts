import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  async sendOtp(phone: string, code: string, name?: string): Promise<void> {
    const provider = this.config.get<string>('SMS_PROVIDER') || 'console';

    // Always log to console for debugging
    this.logger.log(`📱 OTP for ${phone}: ${code}`);

    if (provider === 'eskiz') {
      await this.sendViaEskiz(phone, code);
    } else if (provider === 'twilio') {
      await this.sendViaTwilio(phone, code, name);
    }
    // provider === 'console' → just logs (for dev)
  }

  /**
   * Eskiz.uz — O'zbek SMS provayderi
   * Docs: https://eskiz.uz/api
   */
  private async sendViaEskiz(phone: string, code: string): Promise<void> {
    const email    = this.config.get<string>('ESKIZ_EMAIL');
    const password = this.config.get<string>('ESKIZ_PASSWORD');

    if (!email || !password) {
      this.logger.error('ESKIZ_EMAIL yoki ESKIZ_PASSWORD sozlanmagan');
      return;
    }

    try {
      // Step 1: Get token
      const authRes = await axios.post('https://notify.eskiz.uz/api/auth/login', {
        email,
        password,
      });
      const token = authRes.data?.data?.token;
      if (!token) throw new Error('Eskiz token olinmadi');

      // Step 2: Send SMS
      // Phone must be in format: 998XXXXXXXXX (no +)
      const cleanPhone = phone.replace(/\D/g, '').replace(/^998/, '998');

      await axios.post(
        'https://notify.eskiz.uz/api/message/sms/send',
        {
          mobile_phone: cleanPhone,
          message: `Uzum Dashboard tasdiqlash kodi: ${code}`,
          from: '4546',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      this.logger.log(`Eskiz SMS yuborildi: ${phone}`);
    } catch (err: any) {
      this.logger.error(`Eskiz SMS xatosi: ${err?.message}`);
      // Don't throw — OTP was generated, user can see it via other means
    }
  }

  private async sendViaTwilio(phone: string, code: string, name?: string): Promise<void> {
    const accountSid  = this.config.get<string>('SMS_TWILIO_ACCOUNT_SID');
    const authToken   = this.config.get<string>('SMS_TWILIO_AUTH_TOKEN');
    const fromNumber  = this.config.get<string>('SMS_TWILIO_PHONE_NUMBER');

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
    } catch (err: any) {
      this.logger.error(`Twilio xatosi: ${err?.message}`);
    }
  }
}
