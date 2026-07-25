import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import type { RequestWithUser } from '../../../common/interfaces';
import {
  ANTI_BOT_CHALLENGE_PARAM_KEY,
  CHALLENGE_ANSWER_FIELD,
} from '../../anti-bot.constants';
import {
  CHALLENGE_RESOURCE_RESOLVER,
  type ChallengeResourceResolver,
} from '../../domain/ports/challenge-resource.port';

/**
 * Camada 4 — desafio por recurso.
 *
 * ATAQUE QUE PARA: acesso em massa a um recurso publico cujo dono quer restringir
 * a quem tem uma informacao combinada fora do site (uma palavra passada no
 * convite, o nome de um mascote). Nao e captcha nem senha: o objetivo e cortar
 * quem descobriu a URL, sem obrigar o visitante a criar conta.
 *
 * PASSA DIRETO quando:
 * - nenhuma implementacao de `CHALLENGE_RESOURCE_RESOLVER` esta ligada — e o
 *   estado de um clone novo do template, que nao tem recurso protegido nenhum;
 *   port nao ligado NAO pode derrubar o boot nem trancar rota;
 * - a rota nao declarou `@AntiBot({ challengeParam })`, ou o parametro nao veio;
 * - o recurso nao existe (deixa o handler devolver o 404 — responder aqui
 *   transformaria o desafio em oraculo de existencia de recurso);
 * - o recurso nao pede desafio (`protectionLevel: 'none'`).
 */
@Injectable()
export class ChallengeGuard implements CanActivate {
  private readonly logger = new Logger(ChallengeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(CHALLENGE_RESOURCE_RESOLVER)
    private readonly resolver?: ChallengeResourceResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.resolver) {
      return true;
    }

    const param = this.reflector.getAllAndOverride<string | undefined>(
      ANTI_BOT_CHALLENGE_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!param) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const identifier = request.params?.[param];
    if (typeof identifier !== 'string' || identifier.length === 0) {
      return true;
    }

    const resource = await this.resolver.findProtection(
      identifier,
      request.user?.tenantId || null,
    );
    if (!resource || resource.protectionLevel !== 'challenge') {
      return true;
    }

    const expected = (resource.expectedAnswer ?? '').trim().toLowerCase();
    if (!expected) {
      // Recurso marcado como protegido mas sem resposta cadastrada: nao ha o que
      // conferir. Rejeita (falha fechada) — liberar aqui desligaria a protecao
      // em silencio, que e exatamente o que o dono do recurso pediu para nao
      // acontecer.
      this.logger.error(
        `Resource "${identifier}" requires a challenge but has no expected answer configured.`,
      );
      throw new DomainException(
        ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT,
        'Resposta incorreta. Tente novamente.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const body = request.body as Record<string, unknown> | undefined;
    const answer = body?.[CHALLENGE_ANSWER_FIELD];
    if (typeof answer !== 'string' && typeof answer !== 'number') {
      throw new DomainException(
        ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT,
        'Resposta de segurança obrigatória.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Tolerante com caixa e espaco em volta: a resposta e digitada por gente, e
    // exigir "Fluffy" em vez de " fluffy " geraria abandono sem ganho nenhum.
    if (String(answer).trim().toLowerCase() !== expected) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT,
        'Resposta incorreta. Tente novamente.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
