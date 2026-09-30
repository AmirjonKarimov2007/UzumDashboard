import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto, LogoutDto } from '../dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/send-otp
   * Send OTP to phone number
   */
  @Post('send-otp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  /**
   * POST /auth/verify-otp
   * Verify Telegram OTP and log in an existing user
   */
  @Post('verify-otp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: any) {
    return this.authService.verifyOtp({
      ...dto,
      ipAddress: req.ip,
      userAgent: req.get?.('user-agent'),
    });
  }

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /**
   * POST /auth/logout
   * Logout user
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  /**
   * POST /auth/logout-all
   * Logout from all devices
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser('id') userId: string) {
    return this.authService.logoutAll(userId);
  }

  /**
   * POST /auth/validate
   * Validate access token
   */
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async validate(@CurrentUser('id') userId: string) {
    return this.authService.validateToken(userId);
  }
}
