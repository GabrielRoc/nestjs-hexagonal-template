import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { ANTI_BOT_BODY_FIELDS } from '../../anti-bot.constants';

/**
 * Remove os campos de controle do corpo depois dos guards e ANTES do
 * ZodValidationPipe e do handler (no Nest a ordem e guard -> interceptor ->
 * pipe), para que nem o schema nem o dominio precisem saber que o anti-bot
 * existe.
 *
 * O que isso evita, ja que `z.object()` por si so descarta chave desconhecida:
 * - schema `z.strictObject()` na rota protegida devolveria 400 para todo
 *   formulario legitimo, por causa de um campo que o proprio backend pediu;
 * - `request.body` continua sendo o objeto original em quem le depois do
 *   handler: o AuditLogInterceptor global grava `changes.after` a partir dele, e
 *   o token do Turnstile (centenas de bytes, por requisicao) iria para a coluna
 *   jsonb sem servir para nada;
 * - schema com `.passthrough()` levaria `website`/`_t` para dentro do use case.
 *
 * Muta `request.body` em vez de criar copia: os pipes leem do mesmo objeto, e
 * substituir a referencia nao chegaria em quem ja guardou a antiga.
 */
@Injectable()
export class BodySanitizerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const body: unknown = request.body;

    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const field of ANTI_BOT_BODY_FIELDS) {
        delete (body as Record<string, unknown>)[field];
      }
    }

    return next.handle();
  }
}
