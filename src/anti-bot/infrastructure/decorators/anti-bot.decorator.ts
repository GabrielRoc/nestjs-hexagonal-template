import {
  applyDecorators,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import {
  ANTI_BOT_CHALLENGE_PARAM_KEY,
  FORM_TOKEN_HEADER,
} from '../../anti-bot.constants';
import { HoneypotGuard } from '../guards/honeypot.guard';
import { TimingGuard } from '../guards/timing.guard';
import { FormTokenGuard } from '../guards/form-token.guard';
import { TurnstileGuard } from '../guards/turnstile.guard';
import { ChallengeGuard } from '../guards/challenge.guard';
import { BodySanitizerInterceptor } from '../interceptors/body-sanitizer.interceptor';

export interface AntiBotOptions {
  /**
   * Nome do parametro de rota que identifica o recurso protegido por desafio
   * (ex.: `'slug'` para `POST /v1/things/:slug/messages`). Sem isso o
   * ChallengeGuard passa direto; as outras camadas nao dependem dele.
   */
  challengeParam?: string;
}

/**
 * Aplica o stack anti-bot completo na rota, na ordem do mais barato para o mais
 * caro — cada camada rejeita antes de a proxima gastar CPU, banco ou rede:
 *
 * 1. `HoneypotGuard` — so olha um campo do corpo.
 * 2. `TimingGuard` — uma subtracao.
 * 3. `FormTokenGuard` — HMAC + uma escrita no token store.
 * 4. `TurnstileGuard` — chamada HTTP para a Cloudflare (inerte se desligado).
 * 5. `ChallengeGuard` — consulta do recurso pelo resolver do projeto.
 *
 * Depois dos guards, `BodySanitizerInterceptor` limpa os campos de controle.
 *
 * PRE-REQUISITO: o modulo que declara o controller precisa de
 * `imports: [AntiBotModule]`. Guards de rota sao instanciados no injector do
 * modulo do CONTROLLER, e e la que `TOKEN_STORE`, `FormTokenService` e
 * `TurnstileVerifyService` precisam ser resolviveis. Sem o import, o boot falha
 * com "Nest can't resolve dependencies of the FormTokenGuard" — em vez de a rota
 * ficar silenciosamente sem protecao.
 *
 * NAO aplique em rota cujo frontend nao busca um form token: o FormTokenGuard
 * falha fechado e rejeitaria todos os usuarios. Para rotas em que so o CAPTCHA
 * faz sentido (login, recuperacao de senha), use `@UseGuards(TurnstileGuard)`
 * direto.
 */
export const AntiBot = (options: AntiBotOptions = {}) =>
  applyDecorators(
    SetMetadata(ANTI_BOT_CHALLENGE_PARAM_KEY, options.challengeParam),
    UseGuards(
      HoneypotGuard,
      TimingGuard,
      FormTokenGuard,
      TurnstileGuard,
      ChallengeGuard,
    ),
    UseInterceptors(BodySanitizerInterceptor),
    ApiHeader({
      name: FORM_TOKEN_HEADER,
      required: true,
      description:
        'Token de uso único obtido em GET /api/v1/anti-bot/form-token.',
    }),
  );
