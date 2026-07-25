import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_PROVIDER,
  type AuthProviderPort,
} from '../../domain/ports/auth-provider.port';
import type { ForgotPasswordDto } from '../dtos/forgot-password.dto';

export interface ForgotPasswordResult {
  message: string;
}

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  // Corpo e status identicos nos dois caminhos: qualquer diferenca visivel
  // transformaria a rota em um oraculo de e-mails cadastrados. O tempo de
  // resposta ainda difere (o envio do e-mail custa mais); quem precisar fechar
  // esse canal deve enfileirar o envio. O ThrottlerGuard limita a exploracao.
  private static readonly GENERIC_MESSAGE =
    'Se o e-mail existir, enviaremos um link';

  constructor(
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<ForgotPasswordResult> {
    // O e-mail nunca vai para o log; o dominio basta para detectar abuso.
    const emailDomain = dto.email.split('@')[1] ?? 'unknown';

    const providerUserId =
      await this.authProvider.findEmailPasswordUserIdByEmail(dto.email);

    if (!providerUserId) {
      this.logger.warn(
        `forgot-password requested for unknown account (domain: ${emailDomain})`,
      );
      return { message: ForgotPasswordUseCase.GENERIC_MESSAGE };
    }

    // Uma falha de envio tambem nao pode mudar a resposta: o adapter registra o
    // erro no log do servidor e o cliente recebe a mesma mensagem generica.
    await this.authProvider.sendPasswordResetEmail(providerUserId, dto.email);

    return { message: ForgotPasswordUseCase.GENERIC_MESSAGE };
  }
}
