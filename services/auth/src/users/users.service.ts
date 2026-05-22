import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find user by ID
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { stores: true },
    });
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      include: { stores: true },
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; avatar?: string },
  ) {
    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, NOT: { id: userId } },
      });
      if (existing) {
        throw new ConflictException('Bu email boshqa foydalanuvchiga tegishli');
      }
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}