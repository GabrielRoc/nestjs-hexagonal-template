import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { FORM_TOKEN_HEADER } from '../../anti-bot.constants';
import { setVerifiedFormToken } from '../form-token-context';
import { FormTokenService } from '../services/form-token.service';

/**
 * Camada 2 — token de formulario: VERIFICACAO (o consumo e outra camada).
 *
 * ATAQUE QUE PARA:
 * - POST direto no endpoint, sem nunca ter carregado o formulario: nao existe
 *   header `x-form-token` valido sem chamar `GET /v1/anti-bot/form-token`, e a
 *   assinatura HMAC nao da para forjar sem `ANTI_BOT_TOKEN_SECRET`.
 * - formulario velho/aba parada: `exp` assinado pelo servidor, que o cliente nao
 *   consegue esticar (diferente do `_t` do TimingGuard).
 *
 * O REPLAY (mesmo corpo capturado e reenviado N vezes) e parado pelo par desta
 * camada, o `FormTokenConsumeGuard`, que gasta o `jti` no FIM do stack. A
 * separacao nao e cosmetica: consumir aqui queimava o token antes de o Turnstile
 * e o desafio rodarem, e essas duas camadas falham por erro humano (resposta
 * errada) ou por rede (timeout da Cloudflare) mandando "tente novamente" — a
 * segunda tentativa com o MESMO formulario morria em "token ja utilizado", ou
 * seja um typo trancava o formulario. Ver `decorators/anti-bot.decorator.ts`.
 *
 * Roda CEDO no stack de proposito: custa um HMAC e nenhum I/O, e o `iat` assinado
 * que ela deixa na requisicao (`form-token-context.ts`) e o que permite ao
 * TimingGuard medir a idade do formulario sem depender do relogio do cliente.
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
  constructor(private readonly formTokenService: FormTokenService) {}

  canActivate(context: ExecutionContext): boolean {
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

    if (payload.exp * 1000 - Date.now() <= 0) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_EXPIRED,
        'Formulário expirado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Payload verificado fica na requisicao para as camadas seguintes: o
    // TimingGuard le o `iat`, o FormTokenConsumeGuard gasta o `jti`. Nenhuma
    // delas reverifica a assinatura, e nenhuma le o header de novo.
    setVerifiedFormToken(request, payload);
    return true;
  }
}
