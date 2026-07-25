import { ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TimingGuard } from './timing.guard';
import { TIMESTAMP_FIELD } from '../../anti-bot.constants';
import { setVerifiedFormToken } from '../form-token-context';
import type { FormTokenPayload } from '../services/form-token.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

const MIN_MS = 2_000;
const MAX_MS = 30_000;
const NOW = 1_700_000_000_000;

function configService(): ConfigService {
  const values: Record<string, number> = {
    'antiBot.minTimeMs': MIN_MS,
    'antiBot.maxTimeMs': MAX_MS,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

/**
 * Payload que o FormTokenGuard teria deixado. `iat` e em SEGUNDOS (formato do
 * token), entao a idade medida arredonda para cima em ate 999ms — erra para o
 * lado de deixar passar, que e o lado certo para nao descartar submissao.
 */
function verifiedToken(issuedAtMs: number): FormTokenPayload {
  const iat = Math.floor(issuedAtMs / 1000);
  return { jti: 'jti-1', context: 'signup', iat, exp: iat + MAX_MS / 1000 };
}

function makeContext(timestamp: unknown, verified?: FormTokenPayload) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/things/festa/messages',
    body: timestamp === undefined ? {} : { [TIMESTAMP_FIELD]: timestamp },
  } as unknown as Request;
  if (verified) {
    setVerifiedFormToken(request, verified);
  }
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ExecutionContext;

  return { context, status, json };
}

/** Primeiro argumento da primeira chamada do spy, como texto. */
function firstMessage(spy: jest.SpyInstance): string {
  const calls = spy.mock.calls as unknown[][];
  return String(calls[0][0]);
}

/** Chama o guard e devolve a excecao lancada, falhando se nada for lancado. */
function catchDomainException(fn: () => unknown): DomainException {
  try {
    fn();
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('esperava uma DomainException');
}

describe('TimingGuard', () => {
  let guard: TimingGuard;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    // O descarte por sucesso falso e logado; o spy silencia e serve de assercao.
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    guard = new TimingGuard(configService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('com form token verificado (stack do @AntiBot)', () => {
    it('devolve sucesso falso quando o submit e mais rapido que o minimo', () => {
      const { context, status, json } = makeContext(
        undefined,
        verifiedToken(NOW - MIN_MS / 2),
      );

      expect(guard.canActivate(context)).toBe(false);
      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(json).toHaveBeenCalledWith({ data: { success: true } });
    });

    it('ignora o `_t` do cliente e decide pelo `iat` assinado', () => {
      // O bot manda `_t` dizendo "levei 60s" para passar pela janela; o `iat` do
      // token, que ele nao consegue forjar, diz que o formulario nasceu agora.
      const { context, status } = makeContext(
        NOW - 60_000,
        verifiedToken(NOW - MIN_MS / 2),
      );

      expect(guard.canActivate(context)).toBe(false);
      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('nao descarta submissao legitima quando o relogio do CLIENTE esta adiantado', () => {
      // Relogio do dispositivo 5s adiantado produzia idade negativa e caia no ramo
      // "rapido demais": 200 falso, nada gravado, nada logado. Com o `iat`
      // assinado, a idade real (3s) e a que decide.
      const { context, status } = makeContext(
        NOW + 5_000,
        verifiedToken(NOW - 3_000),
      );

      expect(guard.canActivate(context)).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });

    it('rejeita formulario mais velho que o maximo com codigo de expirado', () => {
      const { context, status } = makeContext(
        undefined,
        verifiedToken(NOW - (MAX_MS + 1_000)),
      );

      const error = catchDomainException(() => guard.canActivate(context));

      expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_EXPIRED);
      expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
      // O ramo de expirado precisa AVISAR o usuario, nao fingir sucesso.
      expect(status).not.toHaveBeenCalled();
    });
  });

  describe('sem form token (TimingGuard aplicado sozinho)', () => {
    it('devolve sucesso falso quando o submit e mais rapido que o minimo', () => {
      const { context, status, json } = makeContext(NOW - (MIN_MS - 1));

      expect(guard.canActivate(context)).toBe(false);
      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(json).toHaveBeenCalledWith({ data: { success: true } });
    });

    it('aceita exatamente no limite minimo', () => {
      const { context, status } = makeContext(NOW - MIN_MS);

      expect(guard.canActivate(context)).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });

    it('aceita exatamente no limite maximo', () => {
      const { context } = makeContext(NOW - MAX_MS);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejeita 1ms depois do limite maximo com codigo de formulario expirado', () => {
      const { context, status } = makeContext(NOW - (MAX_MS + 1));

      const error = catchDomainException(() => guard.canActivate(context));

      expect(error).toBeInstanceOf(DomainException);
      expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_EXPIRED);
      expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(status).not.toHaveBeenCalled();
    });

    it('passa em vez de descartar quando o timestamp do cliente esta no futuro', () => {
      // Idade negativa nao e "submissao instantanea": e relogio adiantado, e
      // tratar como bot descartava dado de gente com um 200 falso. Sem `iat`
      // assinado nao ha o que medir, entao a camada nao opina — e o `_t` nunca foi
      // barreira contra bot, que manda no campo o valor que quiser.
      const { context, status } = makeContext(NOW + 5_000);

      expect(guard.canActivate(context)).toBe(true);
      expect(status).not.toHaveBeenCalled();
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('passa quando o timestamp nao vem', () => {
      const { context, status } = makeContext(undefined);

      expect(guard.canActivate(context)).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });

    it('passa quando o timestamp nao e numerico, sem tratar NaN como dentro da janela', () => {
      const { context, status } = makeContext('nao-e-numero');

      expect(guard.canActivate(context)).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });

    it('aceita timestamp numerico enviado como string', () => {
      const { context } = makeContext(String(NOW - 10_000));

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  it('loga o descarte, para o 200 falso nao ser invisivel ao operador', () => {
    const { context } = makeContext(NOW - (MIN_MS - 1));

    guard.canActivate(context);

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const message = firstMessage(loggerWarn);
    expect(message).toContain('timing-too-fast');
    expect(message).toContain('POST /api/v1/things/festa/messages');
  });
});
