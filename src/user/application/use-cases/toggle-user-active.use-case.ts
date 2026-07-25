import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import Session from 'supertokens-node/recipe/session';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import type { UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

@Injectable()
export class ToggleUserActiveUseCase {
  private readonly logger = new Logger(ToggleUserActiveUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(
    userId: string,
    tenantId: string,
    currentUserId: string,
  ): Promise<UserResponseDto> {
    // A checagem vem antes do findById: quem se desativa perde o proprio acesso
    // e, se for o unico admin, tranca o tenant inteiro.
    if (userId === currentUserId) {
      throw new DomainException(
        ErrorCode.USER_CANNOT_DEACTIVATE_SELF,
        'Não é possível desativar a própria conta',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userRepo.findById(userId, tenantId);
    if (!user) {
      throw new DomainException(
        ErrorCode.USER_NOT_FOUND,
        'Usuário não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    // Só vale para desativacao (isActive === true): reativar um admin nunca
    // reduz a quantidade de administradores ativos do tenant.
    if (user.isActive && user.role === Role.ADMIN) {
      const activeAdmins =
        await this.userRepo.countActiveAdminsByTenantId(tenantId);
      if (activeAdmins <= 1) {
        throw new DomainException(
          ErrorCode.USER_LAST_ADMIN,
          'Não é possível desativar o último administrador ativo',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    user.isActive = !user.isActive;
    const updated = await this.userRepo.update(user);

    if (!updated.isActive) {
      // Sem revogar as sessoes o usuario desativado continuaria autenticado ate
      // o access token expirar; TenantContextMiddleware so consulta o banco em
      // requisicoes novas, entao a sessao antiga seguiria valida.
      await Session.revokeAllSessionsForUser(user.supertokensUserId);
      this.logger.log(`User ${userId} deactivated, sessions revoked`);
    } else {
      this.logger.log(`User ${userId} reactivated`);
    }

    return UserMapper.toResponse(updated);
  }
}
