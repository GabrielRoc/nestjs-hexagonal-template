import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TurnstileGuard } from '../../../anti-bot/infrastructure/guards/turnstile.guard';
import { Public, SkipAuditBody } from '../../../common/decorators';
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
import { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';

/**
 * Fluxo de recuperacao de senha. As demais rotas de autenticacao (sign in,
 * sign out, refresh) sao servidas pelo proprio SuperTokens em `/api/auth/*`.
 *
 * O SDK tambem monta rotas nativas de reset (`/api/auth/user/password/reset` e
 * `.../reset/token`) atendidas pelo middleware express ANTES do router do Nest,
 * fora de qualquer guard ou pipe daqui. Por isso a politica de senha vive no
 * `formFields` do `EmailPassword.init()` (ver `auth.module.ts`): e o unico ponto
 * que estas rotas e as nativas atravessam. Estas rotas existem para entregar
 * mensagens em portugues e o envelope de erro do template.
 *
 * Sendo publicas e nao autenticadas, sao alvo natural de abuso automatizado. O
 * ThrottlerGuard global limita a taxa por IP, e o `TurnstileGuard` do modulo
 * anti-bot esta aplicado nas duas rotas: ele passa direto enquanto
 * `TURNSTILE_ENABLED` nao for `true`, e vira exigencia de CAPTCHA no momento em
 * que o operador configurar as chaves — sem tocar em codigo.
 *
 * O stack completo (`@AntiBot()`) NAO cabe aqui: o FormTokenGuard falha fechado
 * e exigiria que a tela de recuperacao buscasse um token antes do submit, o que
 * este template nao pode assumir do frontend de quem clonar. Turnstile e a
 * camada que funciona sem cooperacao previa do formulario.
 */
@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Post('forgot-password')
  @Public()
  @UseGuards(TurnstileGuard)
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
    description: 'Erro de validação ou verificação de CAPTCHA',
    type: ErrorResponseSwagger,
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return { data: await this.forgotPasswordUseCase.execute(dto) };
  }

  @Post('reset-password')
  @Public()
  @UseGuards(TurnstileGuard)
  @SkipAuditBody()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume the reset token and set a new password' })
  @ApiBody({ type: ResetPasswordSwagger })
  @ApiResponse({ status: 200, description: 'Senha atualizada' })
  @ApiResponse({
    status: 400,
    description:
      'Token inválido/expirado, senha fora da política ou CAPTCHA inválido',
    type: ErrorResponseSwagger,
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return { data: await this.resetPasswordUseCase.execute(dto) };
  }
}
