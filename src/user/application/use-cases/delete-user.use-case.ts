import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import {
  AUTH_PROVIDER,
  type AuthProviderPort,
} from '../../../auth/domain/ports/auth-provider.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

@Injectable()
export class DeleteUserUseCase {
  private readonly logger = new Logger(DeleteUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProviderPort,
  ) {}

  /**
   * Exclusao em duas etapas: primeiro a identidade no provedor, depois o soft
   * delete local.
   *
   * A ordem importa porque so o passo local e transacional. Fazendo o soft delete
   * antes, uma falha de rede no provedor deixava um estado sem saida: `findById`
   * nao ve linha com `deletedAt` preenchido, entao repetir o DELETE respondia 404
   * para sempre e a conta ficava orfa no SuperTokens — ainda capaz de autenticar
   * e de receber link de redefinicao de senha. Na ordem atual, uma falha do
   * provedor nao comita nada localmente e repetir a requisicao reexecuta a
   * limpeza (`revokeAllSessions` e `deleteUser` sao idempotentes no provedor).
   *
   * Atencao: `deleteUser` no provedor e IRREVERSIVEL. O `deletedAt` local
   * preserva o historico (auditoria, referencias), mas nao permite restaurar o
   * acesso: reativar o usuario exige criar uma identidade nova.
   */
  async execute(
    userId: string,
    tenantId: string,
    currentUserId: string,
  ): Promise<void> {
    if (userId === currentUserId) {
      throw new DomainException(
        ErrorCode.USER_CANNOT_DELETE_SELF,
        'Não é possível excluir a própria conta',
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

    // Só um admin ATIVO conta para a regra: countActiveAdminsByTenantId ignora
    // admins inativos, entao excluir um deles nao reduz a contagem nem deixa o
    // tenant sem administrador (mesmo criterio de SetUserActiveUseCase).
    if (user.isActive && user.role === Role.ADMIN) {
      const activeAdmins =
        await this.userRepo.countActiveAdminsByTenantId(tenantId);
      if (activeAdmins <= 1) {
        throw new DomainException(
          ErrorCode.USER_LAST_ADMIN,
          'Não é possível excluir o último administrador ativo',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    await this.authProvider.revokeAllSessions(user.supertokensUserId);
    await this.authProvider.deleteUser(user.supertokensUserId);
    await this.userRepo.softDelete(userId, tenantId);

    this.logger.log(`User ${userId} deleted (provider identity + soft delete)`);
  }
}
