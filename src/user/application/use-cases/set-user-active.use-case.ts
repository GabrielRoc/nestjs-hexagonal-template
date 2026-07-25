import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import {
  AUTH_PROVIDER,
  type AuthProviderPort,
} from '../../../auth/domain/ports/auth-provider.port';
import type { UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

@Injectable()
export class SetUserActiveUseCase {
  private readonly logger = new Logger(SetUserActiveUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProviderPort,
  ) {}

  /**
   * Recebe o estado DESEJADO em vez de inverter o atual.
   *
   * Um toggle com efeito colateral externo nao e retentavel: se a revogacao de
   * sessoes falhasse depois do UPDATE, a acao natural do operador — repetir a
   * requisicao — reativava o usuario e ainda deixava as sessoes antigas vivas.
   * Com o estado explicito, repetir a mesma chamada reexecuta a mesma intencao.
   */
  async execute(
    userId: string,
    tenantId: string,
    currentUserId: string,
    isActive: boolean,
  ): Promise<UserResponseDto> {
    // A checagem vem antes do findById: quem se desativa perde o proprio acesso
    // e, se for o unico admin, tranca o tenant inteiro. Reativar a si mesmo e
    // inofensivo (quem chama a API ja esta ativo), entao so a desativacao e
    // bloqueada.
    if (!isActive && userId === currentUserId) {
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

    // Só vale para desativacao de quem esta ativo: reativar, ou repetir a
    // desativacao de um admin ja inativo, nunca reduz a quantidade de
    // administradores ativos do tenant.
    if (!isActive && user.isActive && user.role === Role.ADMIN) {
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

    if (!isActive) {
      // Antes do UPDATE e sem depender do estado anterior: uma falha aqui nao
      // comita nada, e repetir a chamada com o mesmo `isActive: false` revoga de
      // novo — inclusive quando a linha ja esta inativa por uma tentativa
      // anterior que falhou nesta etapa.
      //
      // Sem revogar, o usuario desativado continuaria autenticado ate o access
      // token expirar; o TenantContextMiddleware so consulta o banco em
      // requisicoes novas, entao a sessao antiga seguiria valida.
      await this.authProvider.revokeAllSessions(user.supertokensUserId);
    }

    user.isActive = isActive;
    const updated = await this.userRepo.update(user);

    this.logger.log(
      `User ${userId} set to ${isActive ? 'active' : 'inactive'}${
        isActive ? '' : ', sessions revoked'
      }`,
    );

    return UserMapper.toResponse(updated);
  }
}
