import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users.service';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email noto\'g\'ri formatda' })
  email?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Kurs noto\'g\'ri' })
  @Max(1_000_000, { message: 'Kurs juda katta' })
  usdRate?: number;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      usdRate: user.usdRate,
      isActive: user.isActive,
      stores: user.stores,
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(userId, dto);
    return {
      id: updated.id,
      phone: updated.phone,
      email: updated.email,
      name: updated.name,
      avatar: updated.avatar,
      usdRate: updated.usdRate,
    };
  }
}
