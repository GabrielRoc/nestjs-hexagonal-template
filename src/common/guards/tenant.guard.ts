import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants';
import { Role } from '../enums/role.enum';
import { RequestWithUser } from '../interfaces';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      return false;
    }

    // SUPERADMIN operates without tenant context
    if (request.user.role === Role.SUPERADMIN) {
      return true;
    }

    if (!request.user.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_CONTEXT_MISSING',
        message: 'Contexto de tenant não encontrado',
      });
    }

    return true;
  }
}
