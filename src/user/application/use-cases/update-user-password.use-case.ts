import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import { convertToRecipeUserId } from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class UpdateUserPasswordUseCase {
  private readonly logger = new Logger(UpdateUserPasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(
    userId: string,
    tenantId: string,
    newPassword: string,
  ): Promise<void> {
    // findById escopado por tenant: sem ele um admin trocaria a senha de um
    // usuario de outro tenant apenas conhecendo o id.
    const user = await this.userRepo.findById(userId, tenantId);
    if (!user) {
      throw new DomainException(
        ErrorCode.USER_NOT_FOUND,
        'Usuário não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await EmailPassword.updateEmailOrPassword({
      recipeUserId: convertToRecipeUserId(user.supertokensUserId),
      password: newPassword,
    });

    if (result.status === 'OK') {
      // Senha trocada por um administrador: as sessoes abertas com a senha
      // antiga precisam morrer junto.
      await Session.revokeAllSessionsForUser(user.supertokensUserId);
      this.logger.log(
        `Password updated and sessions revoked for user ${userId}`,
      );
      return;
    }

    if (result.status === 'UNKNOWN_USER_ID_ERROR') {
      this.logger.warn(
        `Password update failed for user ${userId}: unknown user in auth provider`,
      );
      throw new DomainException(
        ErrorCode.USER_NOT_FOUND,
        'Usuário não encontrado no provedor de autenticação',
        HttpStatus.NOT_FOUND,
      );
    }

    if (result.status === 'PASSWORD_POLICY_VIOLATED_ERROR') {
      this.logger.warn(
        `Password update failed for user ${userId}: password policy violated`,
      );
      throw new DomainException(
        ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
        'A senha não atende aos requisitos mínimos de segurança',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.error(
      `Failed to update password for user ${userId}: ${result.status}`,
    );
    throw new DomainException(
      ErrorCode.USER_PASSWORD_UPDATE_FAILED,
      'Falha ao atualizar a senha',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
