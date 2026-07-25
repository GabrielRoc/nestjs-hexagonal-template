import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { UpdatePasswordResult } from '../../domain/ports/auth-provider.port';

/**
 * Traduz uma falha de troca de senha do provedor em DomainException.
 *
 * Fica em um unico lugar porque DOIS fluxos gravam senha — a rota
 * administrativa (`UpdateUserPasswordUseCase`) e o reset self-service
 * (`ResetPasswordUseCase`). Quando cada um mapeava por conta propria os status
 * divergiram: `UNKNOWN_USER_ID` virava 404 em um e 500 no outro.
 */
export class PasswordUpdateResultMapper {
  /**
   * @param result falha ja normalizada pelo adapter (nunca `OK`)
   * @param policyMessage mensagem de politica; o reset self-service precisa
   *   avisar que o link foi consumido e um novo precisa ser pedido
   */
  static toException(
    result: Exclude<UpdatePasswordResult, { status: 'OK' }>,
    policyMessage = 'A senha não atende aos requisitos mínimos de segurança',
  ): DomainException {
    if (result.status === 'UNKNOWN_USER_ID') {
      return new DomainException(
        ErrorCode.USER_NOT_FOUND,
        'Usuário não encontrado no provedor de autenticação',
        HttpStatus.NOT_FOUND,
      );
    }

    if (result.status === 'POLICY_VIOLATED') {
      // `failureReason` vem do validador registrado em EmailPassword.init, que e
      // o mesmo passwordSchema em portugues — pode ir para o cliente em
      // `details` para ele saber QUAL regra falhou.
      return new DomainException(
        ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
        policyMessage,
        HttpStatus.BAD_REQUEST,
        [{ field: 'newPassword', message: result.failureReason }],
      );
    }

    // 5xx: o GlobalExceptionFilter mascara message e details, e o detalhe do
    // provedor fica apenas no log do servidor.
    return new DomainException(
      ErrorCode.USER_PASSWORD_UPDATE_FAILED,
      `Falha ao atualizar a senha: ${result.detail}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
