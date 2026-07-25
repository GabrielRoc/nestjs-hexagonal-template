import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { RequestWithUser } from '../../../common/interfaces';
import { TenantFeatureService } from '../../application/services/tenant-feature.service';
import type { FeatureKeyValue } from '../../domain/enums/feature-key.enum';
import { FEATURE_KEY } from './requires-feature.decorator';

/**
 * Bloqueia rotas marcadas com @RequiresFeature() quando a flag esta desligada
 * para o tenant da requisicao.
 *
 * Mora no modulo, e nao em `src/common/guards/`: o guard depende de
 * TenantFeatureService e do vocabulario de features, entao coloca-lo em `common`
 * inverteria a dependencia (`common` -> modulo de feature). Como adapter HTTP de
 * entrada, o lugar dele e `infrastructure/http`, junto do controller.
 *
 * Depende de rodar DEPOIS do SuperTokensAuthGuard: sem `request.user` resolvido
 * ele nao tem tenant para avaliar e falha fechado. A ordem esta explicita na
 * lista de APP_GUARD do AppModule.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  private readonly logger = new Logger(FeatureGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantFeatureService: TenantFeatureService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<
      FeatureKeyValue | undefined
    >(FEATURE_KEY, [context.getHandler(), context.getClass()]);

    // Rota sem @RequiresFeature() passa sem tocar em cache nem banco. E o caso
    // da esmagadora maioria das rotas e o motivo de o guard poder ser global.
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    // SUPERADMIN antes de qualquer checagem de tenant, na mesma ordem que
    // RolesGuard e TenantGuard: o superadmin opera sem tenant context
    // (tenant-context.middleware.ts atribui tenantId: '' a ele) e e justamente
    // quem administra as flags. Trocar a ordem faria o superadmin cair no ramo
    // de tenant ausente abaixo e perder as rotas com @RequiresFeature().
    if (request.user?.role === Role.SUPERADMIN) {
      return true;
    }

    // Falha FECHADO, ao contrario da fonte, que devolvia `true` quando faltava
    // `request.user` ou `tenantId`. Uma flag por tenant nao pode ser avaliada
    // sem tenant, e "nao pude avaliar" nunca deve virar "pode passar" num guard
    // de autorizacao. Consequencia pratica: uma rota @Public() marcada com
    // @RequiresFeature() responde 403 em vez de burlar a checagem em silencio.
    // RolesGuard e TenantGuard tambem negam quando falta `request.user`.
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      this.logger.warn(
        `Feature check without tenant context: feature=${requiredFeature}, action=${request.method} ${request.url}`,
      );
      throw new DomainException(
        ErrorCode.TENANT_CONTEXT_MISSING,
        'Contexto de tenant não encontrado',
        HttpStatus.FORBIDDEN,
      );
    }

    const enabled = await this.tenantFeatureService.isFeatureEnabled(
      tenantId,
      requiredFeature,
    );

    if (!enabled) {
      this.logger.warn(
        `Feature disabled: tenantId=${tenantId}, feature=${requiredFeature}, action=${request.method} ${request.url}`,
      );
      throw new DomainException(
        ErrorCode.FEATURE_DISABLED,
        'Este recurso não está disponível no seu plano',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
