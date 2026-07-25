import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnstileGuard } from './turnstile.guard';
import { TURNSTILE_FIELD } from '../../anti-bot.constants';
import type { TurnstileVerifyService } from '../services/turnstile-verify.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

type VerifyMock = jest.Mocked<Pick<TurnstileVerifyService, 'verify'>>;

function configService(enabled: boolean): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      key === 'antiBot.turnstileEnabled' ? enabled : fallback,
  } as unknown as ConfigService;
}

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, ip: '10.0.0.9' }) }),
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

describe('TurnstileGuard', () => {
  let verifier: VerifyMock;

  function guard(enabled: boolean): TurnstileGuard {
    return new TurnstileGuard(
      configService(enabled),
      verifier as unknown as TurnstileVerifyService,
    );
  }

  beforeEach(() => {
    verifier = { verify: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('desligado: passa sem chamar a Cloudflare, mesmo sem token no corpo', async () => {
    await expect(guard(false).canActivate(makeContext({}))).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('ligado: rejeita quando o token do widget nao vem', async () => {
    const error = await catchDomainException(() =>
      guard(true).canActivate(makeContext({ email: 'joao@example.com' })),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CAPTCHA_FAILED);
    expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('ligado: rejeita quando a Cloudflare reprova o token', async () => {
    verifier.verify.mockResolvedValue(false);

    const error = await catchDomainException(() =>
      guard(true).canActivate(makeContext({ [TURNSTILE_FIELD]: 'tk' })),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CAPTCHA_FAILED);
  });

  it('ligado: aceita token valido e repassa o IP do cliente', async () => {
    verifier.verify.mockResolvedValue(true);

    await expect(
      guard(true).canActivate(makeContext({ [TURNSTILE_FIELD]: 'tk' })),
    ).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('tk', '10.0.0.9');
  });

  it('ligado: token nao textual e tratado como ausente', async () => {
    await expect(
      catchDomainException(() =>
        guard(true).canActivate(makeContext({ [TURNSTILE_FIELD]: { a: 1 } })),
      ),
    ).resolves.toBeInstanceOf(DomainException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});
