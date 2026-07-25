import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FormTokenGuard } from './form-token.guard';
import { FORM_TOKEN_HEADER } from '../../anti-bot.constants';
import { InMemoryTokenStore } from '../persistence/in-memory-token-store';
import { FormTokenService } from '../services/form-token.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

const MAX_MS = 1_800_000;
const NOW = 1_700_000_000_000;

function configService(): ConfigService {
  const values: Record<string, unknown> = {
    'antiBot.tokenSecret': 'a'.repeat(64),
    'antiBot.maxTimeMs': MAX_MS,
    'app.nodeEnv': 'test',
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

function makeContext(header: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: header === undefined ? {} : { [FORM_TOKEN_HEADER]: header },
      }),
    }),
  } as unknown as ExecutionContext;
}

async function catchDomainException(
  fn: () => Promise<unknown>,
): Promise<DomainException> {
  try {
    await fn();
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('esperava uma DomainException');
}

describe('FormTokenGuard', () => {
  let guard: FormTokenGuard;
  let formTokenService: FormTokenService;
  let store: InMemoryTokenStore;
  let now: number;

  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // Servico e store reais: "uso unico" e o resultado da conversa entre os dois,
    // e um store mockado provaria apenas que o guard chama um mock.
    formTokenService = new FormTokenService(configService());
    store = new InMemoryTokenStore();
    guard = new FormTokenGuard(formTokenService, store);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita o token emitido pela API', async () => {
    const { token } = formTokenService.issue('signup');

    await expect(guard.canActivate(makeContext(token))).resolves.toBe(true);
  });

  it('recusa o mesmo token na segunda submissao (uso unico)', async () => {
    const { token } = formTokenService.issue('signup');
    await guard.canActivate(makeContext(token));

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(token)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
    expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });

  it('recusa quando o header nao vem', async () => {
    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(undefined)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
  });

  it('recusa header vazio ou com apenas espaco', async () => {
    await expect(
      catchDomainException(() => guard.canActivate(makeContext('   '))),
    ).resolves.toBeInstanceOf(DomainException);
  });

  it('recusa token assinado com outro segredo', async () => {
    const foreignConfig = {
      get: (key: string, fallback?: unknown) =>
        key === 'antiBot.tokenSecret' ? 'b'.repeat(64) : fallback,
    } as unknown as ConfigService;
    const { token } = new FormTokenService(foreignConfig).issue('signup');

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(token)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
  });

  it('recusa token expirado com codigo de formulario expirado', async () => {
    const { token } = formTokenService.issue('signup');

    now = NOW + MAX_MS + 1;

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(token)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_EXPIRED);
  });

  it('nao gasta o token quando ele e rejeitado por expiracao', async () => {
    const markUsed = jest.spyOn(store, 'markUsed');
    const { token } = formTokenService.issue('signup');

    now = NOW + MAX_MS + 1;
    await catchDomainException(() => guard.canActivate(makeContext(token)));

    expect(markUsed).not.toHaveBeenCalled();
  });

  it('marca o uso com TTL que cobre o tempo restante do token', async () => {
    const markUsed = jest.spyOn(store, 'markUsed');
    const { token } = formTokenService.issue('signup');

    now = NOW + 1_000;
    await guard.canActivate(makeContext(token));

    const [, ttlMs] = markUsed.mock.calls[0];
    expect(ttlMs).toBe(MAX_MS - 1_000);
  });
});
