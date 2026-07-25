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
import { FormTokenConsumeGuard } from '../guards/form-token-consume.guard';
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
 * Aplica o stack anti-bot completo na rota. A ORDEM E PARTE DO CONTRATO — o Nest
 * ativa os guards na ordem deste array (`GuardsConsumer.tryActivate`), e ela vai
 * do mais barato para o mais caro, com o unico efeito colateral irreversivel no
 * fim:
 *
 * 1. `HoneypotGuard` — le um campo do corpo, nenhuma dependencia.
 * 2. `FormTokenGuard` — HMAC do header, sem I/O. Apenas VERIFICA: rejeita quem
 *    nunca carregou o formulario antes de qualquer chamada de rede, e deixa o
 *    `iat` assinado na requisicao para o passo 3.
 * 3. `TimingGuard` — uma subtracao, sobre o `iat` assinado do passo 2.
 * 4. `TurnstileGuard` — chamada HTTP para a Cloudflare (inerte se desligado).
 * 5. `ChallengeGuard` — consulta do recurso pelo resolver do projeto.
 * 6. `FormTokenConsumeGuard` — gasta o `jti` (a unica escrita no token store).
 *
 * POR QUE O CONSUMO E O PASSO 6, e nao parte do passo 2: as camadas 4 e 5 falham
 * por rede (timeout da Cloudflare) ou por erro humano (resposta do desafio
 * errada), e as duas mandam o usuario "tentar novamente". Com o token gasto no
 * meio do stack, a segunda tentativa com o MESMO formulario batia em "token ja
 * utilizado" — um typo trancava o formulario e a mensagem pedia o impossivel.
 * Consumir por ultimo mantem o token gastavel enquanto nenhuma camada aprovou, e
 * nao abre replay: o consumo ainda acontece ANTES do handler, que e o que fecha a
 * corrida entre duas submissoes simultaneas do mesmo token.
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
      FormTokenGuard,
      TimingGuard,
      TurnstileGuard,
      ChallengeGuard,
      // Sempre por ultimo: e o unico passo que gasta o token. Ver o comentario
      // acima e `guards/form-token-consume.guard.ts`.
      FormTokenConsumeGuard,
    ),
    UseInterceptors(BodySanitizerInterceptor),
    ApiHeader({
      name: FORM_TOKEN_HEADER,
      required: true,
      description:
        'Token de uso único obtido em GET /api/v1/anti-bot/form-token.',
    }),
  );
