import { ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { Request } from 'express';
import { FormTokenConsumeGuard } from './form-token-consume.guard';
import { setVerifiedFormToken } from '../form-token-context';
import { InMemoryTokenStore } from '../persistence/in-memory-token-store';
import type { FormTokenPayload } from '../services/form-token.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

const NOW = 1_700_000_000_000;
const TTL_SECONDS = 1_800;

function payload(overrides: Partial<FormTokenPayload> = {}): FormTokenPayload {
  const iat = NOW / 1000;
  return {
    jti: 'b3f1c7d0-0000-4000-8000-000000000001',
    context: 'signup',
    iat,
    exp: iat + TTL_SECONDS,
    ...overrides,
  };
}

/**
 * Requisicao com o payload que o FormTokenGuard teria deixado. `verified: null`
 * simula o guard usado sem o FormTokenGuard antes dele.
 */
function makeContext(verified: FormTokenPayload | null) {
  const request = {} as unknown as Request;
  if (verified) {
    setVerifiedFormToken(request, verified);
  }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
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

describe('FormTokenConsumeGuard', () => {
  let guard: FormTokenConsumeGuard;
  let store: InMemoryTokenStore;
  let now: number;

  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // Store real: "uso unico" e o resultado da conversa entre guard e store, e um
    // store mockado provaria apenas que o guard chama um mock.
    store = new InMemoryTokenStore();
    guard = new FormTokenConsumeGuard(store);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita a primeira submissao do token', async () => {
    await expect(guard.canActivate(makeContext(payload()))).resolves.toBe(true);
  });

  it('recusa a segunda submissao do mesmo token (uso unico)', async () => {
    const verified = payload();
    await guard.canActivate(makeContext(verified));

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(verified)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
    expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });

  it('marca o uso com TTL que cobre o tempo restante do token', async () => {
    const markUsed = jest.spyOn(store, 'markUsed');

    now = NOW + 1_000;
    await guard.canActivate(makeContext(payload()));

    const [, ttlMs] = markUsed.mock.calls[0];
    expect(ttlMs).toBe(TTL_SECONDS * 1_000 - 1_000);
  });

  it('falha fechada, sem gastar nada, quando roda sem o FormTokenGuard antes', async () => {
    const markUsed = jest.spyOn(store, 'markUsed');
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(null)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
    expect(markUsed).not.toHaveBeenCalled();
    // O erro de composicao precisa aparecer para o dev, nao so para o usuario.
    expect(loggerError).toHaveBeenCalled();
  });

  it('recusa e nao marca uso quando o token expirou entre a verificacao e o consumo', async () => {
    const markUsed = jest.spyOn(store, 'markUsed');
    const verified = payload();

    // Cenario real: Turnstile lento no meio do stack. Marcar uso aqui criaria uma
    // marca com TTL <= 0, que expira na hora e devolve o token para replay.
    now = NOW + TTL_SECONDS * 1_000 + 1;
    const error = await catchDomainException(() =>
      guard.canActivate(makeContext(verified)),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_EXPIRED);
    expect(markUsed).not.toHaveBeenCalled();
  });
});
