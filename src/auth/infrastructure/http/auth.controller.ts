import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  convertToRecipeUserId,
  listUsersByAccountInfo,
} from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import { Public } from '../../../common/decorators';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ErrorResponseSwagger } from '../../../common/swagger/common.swagger';
import {
  forgotPasswordSchema,
  ForgotPasswordSwagger,
  type ForgotPasswordDto,
} from '../../application/dtos/forgot-password.dto';
import {
  resetPasswordSchema,
  ResetPasswordSwagger,
  type ResetPasswordDto,
} from '../../application/dtos/reset-password.dto';

/**
 * Fluxo de recuperacao de senha. As demais rotas de autenticacao (sign in,
 * sign out, refresh) sao servidas pelo proprio SuperTokens em `/api/auth/*`.
 *
 * Estas duas rotas sao publicas e nao autenticadas, entao sao alvo natural de
 * abuso automatizado. O ThrottlerGuard global ja limita a taxa por IP; para
 * defesa contra bots (CAPTCHA/Turnstile) aplique o guard do modulo anti-bot
 * aqui com `@UseGuards(TurnstileGuard)` em cada rota, junto do `@Public()`.
 * O modulo anti-bot e entregue separadamente e nao e dependencia deste fluxo.
 */
@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset e-mail',
    description:
      'Sempre responde 200 para não permitir enumeração de contas. Se o ' +
      'e-mail existir, o SuperTokens envia o link de redefinição.',
  })
  @ApiBody({ type: ForgotPasswordSwagger })
  @ApiResponse({ status: 200, description: 'Solicitação recebida' })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação',
    type: ErrorResponseSwagger,
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    // Corpo e status identicos nos dois caminhos: qualquer diferenca visivel
    // transformaria a rota em um oraculo de e-mails cadastrados. O tempo de
    // resposta ainda difere (o envio do e-mail custa mais); quem precisar fechar
    // esse canal deve enfileirar o envio. O ThrottlerGuard limita a exploracao.
    const genericResponse = {
      data: { message: 'Se o e-mail existir, enviaremos um link' },
    };

    const users = await listUsersByAccountInfo('public', { email: dto.email });
    const emailPasswordMethod = users
      .flatMap((user) => user.loginMethods)
      .find((method) => method.recipeId === 'emailpassword');

    // O e-mail nunca vai para o log; o dominio basta para detectar abuso.
    const emailDomain = dto.email.split('@')[1] ?? 'unknown';

    if (!emailPasswordMethod) {
      this.logger.warn(
        `forgot-password requested for unknown account (domain: ${emailDomain})`,
      );
      return genericResponse;
    }

    const recipeUserId = emailPasswordMethod.recipeUserId.getAsString();
    const result = await EmailPassword.sendResetPasswordEmail(
      'public',
      recipeUserId,
      dto.email,
    );
    if (result.status !== 'OK') {
      this.logger.error(
        `sendResetPasswordEmail failed for userId=${recipeUserId}: ${result.status}`,
      );
    }

    return genericResponse;
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume the reset token and set a new password' })
  @ApiBody({ type: ResetPasswordSwagger })
  @ApiResponse({ status: 200, description: 'Senha atualizada' })
  @ApiResponse({
    status: 400,
    description: 'Token inválido/expirado ou senha fora da política',
    type: ErrorResponseSwagger,
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    const consumed = await EmailPassword.consumePasswordResetToken(
      'public',
      dto.token,
    );
    if (consumed.status === 'RESET_PASSWORD_INVALID_TOKEN_ERROR') {
      throw new DomainException(
        ErrorCode.AUTH_RESET_TOKEN_INVALID,
        'Link inválido ou expirado',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await EmailPassword.updateEmailOrPassword({
      recipeUserId: convertToRecipeUserId(consumed.userId),
      password: dto.newPassword,
    });
    if (updated.status === 'PASSWORD_POLICY_VIOLATED_ERROR') {
      throw new DomainException(
        ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
        'A senha não atende aos requisitos mínimos de segurança',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (updated.status !== 'OK') {
      this.logger.error(`updateEmailOrPassword failed: ${updated.status}`);
      throw new DomainException(
        ErrorCode.USER_PASSWORD_UPDATE_FAILED,
        'Falha ao atualizar a senha',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Quem pediu o reset provavelmente perdeu o controle da conta: derruba toda
    // sessao aberta com a senha antiga.
    await Session.revokeAllSessionsForUser(consumed.userId);

    return { data: { message: 'Senha atualizada com sucesso' } };
  }
}
