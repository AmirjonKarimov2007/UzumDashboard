import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto, LogoutDto } from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/send-otp
   * Send OTP to phone number
   */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  /**
   * POST /auth/verify-otp
   * Verify OTP and login/register user
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
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
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Body() body: { userId: string }) {
    return this.authService.logoutAll(body.userId);
  }

  /**
   * POST /auth/validate
   * Validate access token
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() body: { userId: string }) {
    return this.authService.validateToken(body.userId);
  }
}