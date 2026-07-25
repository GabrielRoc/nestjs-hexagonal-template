import { Request } from 'express';
import type { FormTokenPayload } from './services/form-token.service';

/**
 * Chave onde o `FormTokenGuard` guarda o payload JA VERIFICADO do form token
 * para as camadas seguintes do mesmo stack (TimingGuard, que precisa do `iat`
 * assinado, e FormTokenConsumeGuard, que gasta o `jti`).
 *
 * `Symbol` e nao string: nao aparece em `Object.keys`, nao entra em
 * `JSON.stringify(request)` de log nenhum e nao pode colidir com propriedade que
 * o Express, o SuperTokens ou um middleware do projeto ponham na requisicao.
 */
const VERIFIED_FORM_TOKEN = Symbol('antiBot.verifiedFormToken');

type RequestWithFormToken = Request & {
  [VERIFIED_FORM_TOKEN]?: FormTokenPayload;
};

/** Chamado UMA vez, pelo FormTokenGuard, depois de a assinatura conferir. */
export function setVerifiedFormToken(
  request: Request,
  payload: FormTokenPayload,
): void {
  (request as RequestWithFormToken)[VERIFIED_FORM_TOKEN] = payload;
}

/**
 * @returns o payload quando o FormTokenGuard rodou e aprovou o token nesta
 *   requisicao; `undefined` quando ele nao esta no stack da rota. Quem le precisa
 *   tratar o `undefined` — nunca assumir que o guard rodou.
 */
export function getVerifiedFormToken(
  request: Request,
): FormTokenPayload | undefined {
  return (request as RequestWithFormToken)[VERIFIED_FORM_TOKEN];
}
