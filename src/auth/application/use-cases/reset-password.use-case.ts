import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import {
  AUTH_PROVIDER,
  type AuthProviderPort,
} from '../../domain/ports/auth-provider.port';
import type { ResetPasswordDto } from '../dtos/reset-password.dto';
import { PasswordUpdateResultMapper } from '../mappers/password-update-result.mapper';

export interface ResetPasswordResult {
  message: string;
}

@Injectable()
export class ResetPasswordUseCase {
  private readonly logger = new Logger(ResetPasswordUseCase.name);

  constructor(
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<ResetPasswordResult> {
    // O token e de uso unico: consumi-lo e irreversivel. Toda validacao capaz de
    // reprovar a senha roda ANTES daqui — o ZodValidationPipe da rota usa o
    // mesmo passwordSchema registrado no provedor, entao uma senha fora da
    // politica e recusada com o token ainda valido.
    const consumed = await this.authProvider.consumePasswordResetToken(
      dto.token,
    );
    if (consumed.status !== 'OK') {
      throw new DomainException(
        ErrorCode.AUTH_RESET_TOKEN_INVALID,
        'Link inválido ou expirado',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.authProvider.updatePassword(
      consumed.providerUserId,
      dto.newPassword,
    );
    if (updated.status !== 'OK') {
      // O token ja foi queimado: a mensagem precisa dizer que outro link e
      // necessario, senao o usuario repete o mesmo link e recebe 'inválido'.
      throw PasswordUpdateResultMapper.toException(
        updated,
        'A senha não atende aos requisitos mínimos de segurança. Solicite um novo link para tentar de novo',
      );
    }

    // Quem pediu o reset provavelmente perdeu o controle da conta: derruba toda
    // sessao aberta com a senha antiga.
    await this.authProvider.revokeAllSessions(consumed.providerUserId);
    this.logger.log(
      `Password reset completed for providerUserId=${consumed.providerUserId}`,
    );

    return { message: 'Senha atualizada com sucesso' };
  }
}
