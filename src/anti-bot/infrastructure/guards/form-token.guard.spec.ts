import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { FormTokenGuard } from './form-token.guard';
import { FORM_TOKEN_HEADER } from '../../anti-bot.constants';
import { getVerifiedFormToken } from '../form-token-context';
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

function makeContext(header: unknown) {
  const request = {
    headers: header === undefined ? {} : { [FORM_TOKEN_HEADER]: header },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function catchDomainException(fn: () => unknown): DomainException {
  try {
    fn();
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('esperava uma DomainException');
}

describe('FormTokenGuard', () => {
  let guard: FormTokenGuard;
  let formTokenService: FormTokenService;
  let now: number;

  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // Servico real: o que este guard promete e "so token que a API emitiu passa",
    // e com um verify mockado o teste provaria apenas que o guard chama um mock.
    formTokenService = new FormTokenService(configService());
    guard = new FormTokenGuard(formTokenService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita o token emitido pela API', () => {
    const { token } = formTokenService.issue('signup');

    expect(guard.canActivate(makeContext(token).context)).toBe(true);
  });

  it('deixa o payload verificado na requisicao para as camadas seguintes', () => {
    const { token } = formTokenService.issue('signup');
    const { context, request } = makeContext(token);

    guard.canActivate(context);

    const payload = getVerifiedFormToken(request);
    expect(payload?.context).toBe('signup');
    // O `iat` assinado e o que o TimingGuard usa em vez do relogio do cliente.
    expect(payload?.iat).toBe(NOW / 1000);
  });

  it('NAO gasta o token: verificar nao consome (quem consome e o consume guard)', () => {
    const { token } = formTokenService.issue('signup');

    // A segunda passagem pelo mesmo token tem de continuar valida — e o que
    // permite ao usuario reenviar o formulario depois de o desafio ou o Turnstile
    // recusarem a tentativa anterior dizendo "tente novamente".
    expect(guard.canActivate(makeContext(token).context)).toBe(true);
    expect(guard.canActivate(makeContext(token).context)).toBe(true);
  });

  it('recusa quando o header nao vem', () => {
    const error = catchDomainException(() =>
      guard.canActivate(makeContext(undefined).context),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
    expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });

  it('recusa header vazio ou com apenas espaco', () => {
    expect(
      catchDomainException(() => guard.canActivate(makeContext('   ').context)),
    ).toBeInstanceOf(DomainException);
  });

  it('recusa token assinado com outro segredo', () => {
    const foreignConfig = {
      get: (key: string, fallback?: unknown) =>
        key === 'antiBot.tokenSecret' ? 'b'.repeat(64) : fallback,
    } as unknown as ConfigService;
    const { token } = new FormTokenService(foreignConfig).issue('signup');

    const error = catchDomainException(() =>
      guard.canActivate(makeContext(token).context),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
  });

  it('recusa token expirado com codigo de formulario expirado', () => {
    const { token } = formTokenService.issue('signup');

    now = NOW + MAX_MS + 1;

    const error = catchDomainException(() =>
      guard.canActivate(makeContext(token).context),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_EXPIRED);
  });

  it('nao deixa payload na requisicao quando rejeita', () => {
    const { token } = formTokenService.issue('signup');
    const { context, request } = makeContext(token);

    now = NOW + MAX_MS + 1;
    catchDomainException(() => guard.canActivate(context));

    // Sem isso, o consume guard que roda depois gastaria um token ja expirado.
    expect(getVerifiedFormToken(request)).toBeUndefined();
  });
});
