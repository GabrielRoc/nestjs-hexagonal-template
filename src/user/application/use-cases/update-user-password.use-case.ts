import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import {
  AUTH_PROVIDER,
  type AuthProviderPort,
} from '../../../auth/domain/ports/auth-provider.port';
import { PasswordUpdateResultMapper } from '../../../auth/application/mappers/password-update-result.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class UpdateUserPasswordUseCase {
  private readonly logger = new Logger(UpdateUserPasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProviderPort,
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

    const result = await this.authProvider.updatePassword(
      user.supertokensUserId,
      newPassword,
    );
    if (result.status !== 'OK') {
      this.logger.warn(
        `Password update failed for user ${userId}: ${result.status}`,
      );
      // Mapeamento compartilhado com o reset self-service: um unico lugar decide
      // qual status do provedor vira 404, 400 ou 500.
      throw PasswordUpdateResultMapper.toException(result);
    }

    // Senha trocada por um administrador: as sessoes abertas com a senha antiga
    // precisam morrer junto.
    await this.authProvider.revokeAllSessions(user.supertokensUserId);
    this.logger.log(`Password updated and sessions revoked for user ${userId}`);
  }
}
