import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// The owner account requested by the operator. Compare the database identity,
// never a phone/role supplied in request parameters or a client-side flag.
export const SUPER_ADMIN_PHONE = '998917897621';
export function isSuperAdmin(phone?: string): boolean {
  return phone === SUPER_ADMIN_PHONE || phone === `+${SUPER_ADMIN_PHONE}`;
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isSuperAdmin(context.switchToHttp().getRequest().user?.phone)) {
      throw new ForbiddenException('Faqat super-admin uchun');
    }
    return true;
  }
}
