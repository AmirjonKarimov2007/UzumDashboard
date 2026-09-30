import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { UsersController } from './controllers/users.controller';
import { AdminController } from './controllers/admin.controller';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    SessionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '7d' },
      }),
    }),
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService, SuperAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
