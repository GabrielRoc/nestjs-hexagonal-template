import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimingGuard } from './timing.guard';
import { TIMESTAMP_FIELD } from '../../anti-bot.constants';
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

function makeContext(timestamp: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        body: timestamp === undefined ? {} : { [TIMESTAMP_FIELD]: timestamp },
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ExecutionContext;

  return { context, status, json };
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

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    guard = new TimingGuard(configService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
    // O ramo de expirado precisa AVISAR o usuario, nao fingir sucesso.
    expect(status).not.toHaveBeenCalled();
  });

  it('trata timestamp no futuro como rapido demais', () => {
    const { context, status } = makeContext(NOW + 5_000);

    expect(guard.canActivate(context)).toBe(false);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
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
