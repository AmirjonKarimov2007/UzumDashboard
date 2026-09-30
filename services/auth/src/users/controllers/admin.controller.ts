import { Controller, Get, Header, Param, Query, UseGuards, NotFoundException, ServiceUnavailableException, Patch, Delete, Post, Body, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/database/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { decrypt } from '../../common/utils/crypto.util';
import { isSuperAdmin } from '../../common/guards/super-admin.guard';
import { SessionService } from '../../sessions/sessions.service';

class AdminUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}

class AdminSetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  @Get('users')
  @Header('Cache-Control', 'no-store')
  async users(@Query('page') pageValue?: string, @Query('search') searchValue?: string) {
    const page = Math.min(1_000_000, Math.max(0, Math.floor(Number(pageValue) || 0)));
    const search = (searchValue || '').trim().slice(0, 100);
    const where = search ? { OR: [
      { phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' as const } },
      { stores: { some: { name: { contains: search, mode: 'insensitive' as const } } } },
    ] } : {};
    const [totalUsers, totalStores, connectedStores, total, users] = await Promise.all([
      this.prisma.user.count(), this.prisma.store.count(),
      this.prisma.storeConnection.count({ where: { isConnected: true } }), this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, skip: page * 25, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: { id: true, phone: true, name: true, isActive: true, createdAt: true, password: true,
          telegramUser: { select: { username: true, firstName: true, lastName: true, isActive: true } },
          stores: { select: { id: true, name: true, status: true, plan: true,
            connection: { select: { uzumShopId: true, isConnected: true, lastSyncAt: true, lastSyncStatus: true } } } } } }),
    ]);
    return {
      totalUsers, totalStores, connectedStores, total, page, size: 25,
      users: users.map(({ password, ...user }) => ({ ...user, hasPassword: Boolean(password) })),
    };
  }

  @Patch('users/:userId/status')
  @Header('Cache-Control', 'no-store')
  async setStatus(
    @CurrentUser('id') adminId: string,
    @Param('userId') userId: string,
    @Body() dto: AdminUserStatusDto,
  ) {
    const target = await this.mutableUser(adminId, userId);
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { isActive: dto.isActive },
      select: { id: true, isActive: true },
    });
    if (!dto.isActive) await this.revokeUserSessions(userId);
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_USER_STATUS_CHANGED',
        entity: 'User',
        entityId: userId,
        metadata: { isActive: dto.isActive },
      },
    });
    return updated;
  }

  @Patch('users/:userId/password')
  @Header('Cache-Control', 'no-store')
  async setPassword(
    @CurrentUser('id') adminId: string,
    @Param('userId') userId: string,
    @Body() dto: AdminSetPasswordDto,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new NotFoundException('Foydalanuvchi topilmadi');
    const password = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password } });
    await this.revokeUserSessions(userId);
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: userId,
        metadata: { changedByAdmin: true },
      },
    });
    return { ok: true };
  }

  @Post('users/:userId/impersonate')
  @Header('Cache-Control', 'no-store')
  async impersonate(@CurrentUser('id') adminId: string, @Param('userId') userId: string) {
    if (adminId === userId) throw new BadRequestException('O‘zingizning dashboardingiz allaqachon ochiq');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stores: true },
    });
    if (!target) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (!target.isActive) throw new BadRequestException('Bloklangan foydalanuvchi dashboardini ochib bo‘lmaydi');
    const accessToken = await this.jwt.signAsync({
      sub: target.id,
      phone: target.phone,
      name: target.name,
      impersonatedBy: adminId,
    }, { expiresIn: '2h' });
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_IMPERSONATION_STARTED',
        entity: 'User',
        entityId: userId,
        metadata: { expiresIn: '2h' },
      },
    });
    return {
      accessToken,
      expiresIn: 7200,
      user: {
        id: target.id,
        phone: target.phone,
        email: target.email,
        name: target.name,
        avatar: target.avatar,
        stores: target.stores,
      },
    };
  }

  @Delete('users/:userId')
  @Header('Cache-Control', 'no-store')
  async removeUser(@CurrentUser('id') adminId: string, @Param('userId') userId: string) {
    const target = await this.mutableUser(adminId, userId);
    await this.revokeUserSessions(userId);
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_USER_DELETED',
        entity: 'User',
        entityId: userId,
        metadata: { phone: target.phone },
      },
    });
    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  @Get('stores/:storeId/api-key')
  @Header('Cache-Control', 'no-store')
  async apiKey(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    const connection = await this.prisma.storeConnection.findUnique({ where: { storeId } });
    if (!connection) throw new NotFoundException('Do‘kon API ulanishi yo‘q');
    const secret = this.config.get<string>('ENCRYPTION_SECRET');
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('Shifrlash sozlamasi topilmadi');
    let apiKey: string;
    try { apiKey = decrypt(connection.apiKeyEncrypted, connection.apiKeyIv, connection.apiKeyTag, secret); }
    catch { throw new ServiceUnavailableException('API kalitni o‘qib bo‘lmadi'); }
    await this.prisma.auditLog.create({ data: { userId, action: 'ADMIN_VIEW_STORE_API_KEY', entity: 'Store', entityId: storeId } });
    return { apiKey };
  }

  private async mutableUser(adminId: string, userId: string) {
    if (adminId === userId) throw new BadRequestException('Super-admin o‘zini bloklashi yoki o‘chirishi mumkin emas');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true },
    });
    if (!target) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (isSuperAdmin(target.phone)) throw new BadRequestException('Super-admin akkauntini o‘zgartirib bo‘lmaydi');
    return target;
  }

  private async revokeUserSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    await this.sessions.deleteAllSessions(userId);
  }
}
