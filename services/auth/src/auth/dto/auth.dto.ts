import { IsPhoneNumber, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty()
  @IsString()
  @IsPhoneNumber('UZ')
  phone: string;
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @IsPhoneNumber('UZ')
  phone: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  code: string;

  device?: {
    type?: string;
    os?: string;
    browser?: string;
  };

  ipAddress?: string;
  userAgent?: string;
}

export class RefreshTokenDto {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;

  @IsNotEmpty()
  @IsString()
  userId: string;
}