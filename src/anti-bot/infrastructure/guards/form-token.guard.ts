import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { FORM_TOKEN_HEADER } from '../../anti-bot.constants';
import {
  TOKEN_STORE,
  type TokenStore,
} from '../../domain/ports/token-store.port';
import { FormTokenService } from '../services/form-token.service';

/**
 * Camada 3 — token de formulario de uso unico.
 *
 * ATAQUE QUE PARA:
 * - POST direto no endpoint, sem nunca ter carregado o formulario: nao existe
 *   header `x-form-token` valido sem chamar `GET /v1/anti-bot/form-token`, e a
 *   assinatura HMAC nao da para forjar sem `ANTI_BOT_TOKEN_SECRET`.
 * - REPLAY: o mesmo corpo capturado e reenviado N vezes. O `jti` e marcado no
 *   TOKEN_STORE na primeira vez; da segunda em diante e rejeitado.
 * - formulario velho/aba parada: `exp` assinado pelo servidor, que o cliente nao
 *   consegue esticar (diferente do `_t` do TimingGuard).
 *
 * E a UNICA camada que falha fechada: sem header valido, ninguem entra. Por isso
 * ela so entra por `@AntiBot()` explicito, nunca global — ligada numa rota cujo
 * frontend nao busca token, rejeita 100% dos usuarios.
 *
 * LIMITE: o token e emitido para qualquer um que peca (a rota e publica), entao
 * ele nao segura volume — um bot pede um token por submissao. O que ele garante
 * e ORIGEM (passou pela API), IDADE e USO UNICO. Volume e trabalho do
 * ThrottlerGuard e do Turnstile.
 */
@Injectable()
export class FormTokenGuard implements CanActivate {
  constructor(
    private readonly formTokenService: FormTokenService,
    @Inject(TOKEN_STORE)
    private readonly tokenStore: TokenStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers[FORM_TOKEN_HEADER];
    const token = typeof raw === 'string' ? raw.trim() : '';

    if (!token) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID,
        'Token de formulário ausente. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = this.formTokenService.verify(token);
    if (!payload) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID,
        'Token de formulário inválido. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const remainingMs = payload.exp * 1000 - Date.now();
    if (remainingMs <= 0) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_EXPIRED,
        'Formulário expirado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // A marca de uso precisa durar pelo menos o tempo que resta do token; menos
    // que isso e o token volta a ser aceito antes de expirar.
    const isFirstUse = await this.tokenStore.markUsed(payload.jti, remainingMs);
    if (!isFirstUse) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID,
        'Token de formulário já utilizado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
