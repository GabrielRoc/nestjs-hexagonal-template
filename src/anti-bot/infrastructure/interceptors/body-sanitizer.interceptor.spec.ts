import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { BodySanitizerInterceptor } from './body-sanitizer.interceptor';
import {
  ANTI_BOT_BODY_FIELDS,
  CHALLENGE_ANSWER_FIELD,
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
  TURNSTILE_FIELD,
} from '../../anti-bot.constants';

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of('handler') };

describe('BodySanitizerInterceptor', () => {
  let interceptor: BodySanitizerInterceptor;

  beforeEach(() => {
    interceptor = new BodySanitizerInterceptor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('remove todos os campos de controle e preserva o resto', () => {
    const body: Record<string, unknown> = {
      email: 'joao@example.com',
      [HONEYPOT_FIELD]: '',
      [TIMESTAMP_FIELD]: 1_700_000_000_000,
      [TURNSTILE_FIELD]: 'tk',
      [CHALLENGE_ANSWER_FIELD]: 'fluffy',
    };

    interceptor.intercept(makeContext(body), next);

    expect(body).toEqual({ email: 'joao@example.com' });
  });

  /**
   * Guarda contra deriva: se um campo de controle novo aparecer nos guards e nao
   * entrar na lista de remocao, ele vaza para o DTO, para o audit log e para o
   * dominio sem quebrar nenhum outro teste.
   */
  it('cobre todos os campos de controle conhecidos', () => {
    expect([...ANTI_BOT_BODY_FIELDS].sort()).toEqual(
      [
        HONEYPOT_FIELD,
        TIMESTAMP_FIELD,
        TURNSTILE_FIELD,
        CHALLENGE_ANSWER_FIELD,
      ].sort(),
    );
  });

  it('nao quebra sem corpo', () => {
    expect(() =>
      interceptor.intercept(makeContext(undefined), next),
    ).not.toThrow();
  });

  it('nao mexe em corpo que e array', () => {
    const body = [{ [HONEYPOT_FIELD]: 'x' }];

    interceptor.intercept(makeContext(body), next);

    expect(body).toEqual([{ [HONEYPOT_FIELD]: 'x' }]);
  });

  it('continua a cadeia', (done) => {
    interceptor.intercept(makeContext({}), next).subscribe((value) => {
      expect(value).toBe('handler');
      done();
    });
  });
});
