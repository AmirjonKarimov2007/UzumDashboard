import { IsString, IsBoolean, IsOptional, MinLength, Matches, IsNotEmpty } from 'class-validator';

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

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;
}
