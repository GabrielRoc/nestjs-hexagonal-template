import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import { deleteUser } from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

@Injectable()
export class DeleteUserUseCase {
  private readonly logger = new Logger(DeleteUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

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

    if (user.role === Role.ADMIN) {
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

    await this.userRepo.softDelete(userId, tenantId);
    await Session.revokeAllSessionsForUser(user.supertokensUserId);
    await deleteUser(user.supertokensUserId);

    this.logger.log(`User ${userId} deleted (soft delete + SuperTokens)`);
  }
}
