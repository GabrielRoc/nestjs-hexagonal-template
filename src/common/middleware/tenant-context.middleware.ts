import { Inject, Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, NextFunction } from 'express';
import Session from 'supertokens-node/recipe/session';
import { Role } from '../enums/role.enum';
import { RequestWithUser } from '../interfaces';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../user/domain/ports/user.repository.port';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);
  private readonly superadminIds: Set<string>;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
    private readonly configService: ConfigService,
  ) {
    const ids = this.configService.get<string>(
      'SUPERADMIN_SUPERTOKENS_IDS',
      '',
    );
    this.superadminIds = new Set(
      ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  async use(
    req: RequestWithUser,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const session = await Session.getSession(req, _res, {
        sessionRequired: false,
      });

      if (session) {
        const supertokensUserId = session.getUserId();

        const user =
          await this.userRepo.findActiveBySupertokensUserId(supertokensUserId);

        if (user) {
          req.user = {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
            supertokensUserId,
          };
        } else if (this.superadminIds.has(supertokensUserId)) {
          req.user = {
            userId: 'superadmin',
            tenantId: '',
            role: Role.SUPERADMIN,
            supertokensUserId,
          };
        }

        this.logger.debug(
          `Session resolved for SuperTokens user: ${supertokensUserId}, role: ${req.user?.role ?? 'none'}`,
        );
      }
    } catch {
      // No valid session — request.user stays undefined.
      // Auth guard (SuperTokensAuthGuard) will reject non-public routes.
    }

    next();
  }
}
