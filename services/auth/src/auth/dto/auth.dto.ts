import { IsPhoneNumber, IsNotEmpty, IsString, MinLength, IsNumber, IsOptional, MaxLength, Length, Matches, IsObject } from 'class-validator';

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
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;

  @IsOptional()
  @IsObject()
  device?: {
    type?: string;
    os?: string;
    browser?: string;
  };

  ipAddress?: string;
  userAgent?: string;
}

export class TelegramLoginDto {
  @IsNotEmpty()
  @IsString()
  initData: string;

  device?: {
    type?: string;
    os?: string;
    browser?: string;
  };

  ipAddress?: string;
  userAgent?: string;
}

export class TelegramWidgetLoginDto {
  @IsNumber()
  id: number;

  @IsString()
  @MaxLength(100)
  first_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string;

  @IsNumber()
  auth_date: number;

  @IsNotEmpty()
  @IsString()
  hash: string;
}

export class PasswordLoginDto {
  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
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
