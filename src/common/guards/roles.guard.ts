import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../constants';
import { Role } from '../enums/role.enum';
import { RequestWithUser } from '../interfaces';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      return false;
    }

    // SUPERADMIN bypasses all role checks
    if (request.user.role === Role.SUPERADMIN) {
      return true;
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => request.user.role === role);
    if (!hasRole) {
      throw new ForbiddenException({
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'Você não tem permissão para acessar este recurso',
      });
    }

    return true;
  }
}
