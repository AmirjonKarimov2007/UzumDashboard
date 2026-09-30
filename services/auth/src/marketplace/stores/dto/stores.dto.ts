import { IsString, IsBoolean, IsOptional, MinLength, Matches, IsNotEmpty, MaxLength } from 'class-validator';

export class ConnectStoreDto {
  @IsString()
  @IsNotEmpty()
  uzumShopId: string;

  @IsString()
  @MinLength(16)
  apiKey: string;

  @IsBoolean()
  @IsOptional()
  autoSync?: boolean;
}

export class UpdateConnectionDto {
  @IsBoolean()
  autoSync: boolean;
}

export class UpdateSmartupSettingsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[^\u0000-\u001F\u007F]+$/u, {
    message: 'Smartup klient ID boshqaruv belgilarini saqlamasligi kerak',
  })
  clientId: string;
}

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;
}
