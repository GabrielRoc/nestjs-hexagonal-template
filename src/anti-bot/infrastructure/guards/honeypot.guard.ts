import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { HONEYPOT_FIELD } from '../../anti-bot.constants';
import { respondWithFakeSuccess } from '../fake-success';

/**
 * Camada 1 — isca.
 *
 * ATAQUE QUE PARA: bot que preenche todo `<input>` que encontra no formulario.
 * O campo `website` fica escondido por CSS e nao e visivel para quem usa o site,
 * entao qualquer valor nele veio de um preenchedor automatico.
 *
 * Ao pegar o bot devolve 200 falso (ver fake-success.ts) — nao 403.
 *
 * Testa por VALOR e nao por presenca: navegador de verdade envia o campo
 * escondido vazio (`website: ''`) em todo submit de formulario HTML. Checar
 * presenca rejeitaria todos os usuarios legitimos.
 */
@Injectable()
export class HoneypotGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const body = http.getRequest<Request>().body as
      Record<string, unknown> | undefined;

    if (!body?.[HONEYPOT_FIELD]) {
      return true;
    }

    respondWithFakeSuccess(http.getResponse<Response>());
    return false;
  }
}
