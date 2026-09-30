import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StoreOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.user?.id || !request.params?.storeId) throw new ForbiddenException();
    const store = await this.prisma.store.findFirst({ where: { id: request.params.storeId, userId: request.user.id }, select: { id: true } });
    if (!store) throw new ForbiddenException('Bu do‘kon uchun ruxsat yo‘q');
    return true;
  }
}
