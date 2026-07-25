import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FormTokenService } from './form-token.service';

const SECRET = 'a'.repeat(64);
const MAX_MS = 1_800_000;

function configService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'antiBot.tokenSecret': SECRET,
    'antiBot.maxTimeMs': MAX_MS,
    'app.nodeEnv': 'test',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

/** Reassina o payload alterado com um segredo diferente. */
function tamperPayload(
  token: string,
  changes: Record<string, unknown>,
): string {
  const [header, body, signature] = token.split('.');
  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString('utf-8'),
  ) as Record<string, unknown>;
  const forged = Buffer.from(
    JSON.stringify({ ...payload, ...changes }),
  ).toString('base64url');
  return `${header}.${forged}.${signature}`;
}

describe('FormTokenService', () => {
  let service: FormTokenService;
  let loggerWarn: jest.SpyInstance;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    // O aviso de segredo ausente sai no construtor: o spy tem de existir antes.
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = new FormTokenService(configService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifica o token que emitiu e preserva o contexto', () => {
    const { token } = service.issue('signup');

    const payload = service.verify(token);

    expect(payload?.context).toBe('signup');
    expect(payload?.jti).toHaveLength(36);
  });

  it('deriva o exp de maxTimeMs, para nao divergir do TimingGuard', () => {
    const payload = service.verify(service.issue('signup').token);

    expect(payload!.exp - payload!.iat).toBe(MAX_MS / 1000);
  });

  it('emite jti diferente a cada chamada', () => {
    const first = service.verify(service.issue('signup').token)!;
    const second = service.verify(service.issue('signup').token)!;

    expect(first.jti).not.toBe(second.jti);
  });

  it('rejeita payload alterado sem reassinar', () => {
    const { token } = service.issue('signup');

    expect(
      service.verify(tamperPayload(token, { exp: 9_999_999_999 })),
    ).toBeNull();
  });

  it('rejeita token assinado com outro segredo', () => {
    const foreign = new FormTokenService(
      configService({ 'antiBot.tokenSecret': 'b'.repeat(64) }),
    );

    expect(service.verify(foreign.issue('signup').token)).toBeNull();
  });

  it('rejeita token malformado', () => {
    expect(service.verify('')).toBeNull();
    expect(service.verify('sem.pontos')).toBeNull();
    expect(service.verify('a.b.c')).toBeNull();
  });

  it('sem ANTI_BOT_TOKEN_SECRET nao existe segredo compartilhado — nem default no repositorio', () => {
    const config = configService({ 'antiBot.tokenSecret': '' });
    const instanceA = new FormTokenService(config);
    const instanceB = new FormTokenService(config);

    // Se houvesse um default fixo ('dev-secret' e afins), este verify passaria —
    // e qualquer um com o codigo em maos forjaria form tokens em producao.
    expect(instanceB.verify(instanceA.issue('signup').token)).toBeNull();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('registra erro (nao warn) quando falta o segredo em producao', () => {
    loggerWarn.mockClear();
    loggerError.mockClear();

    new FormTokenService(
      configService({
        'antiBot.tokenSecret': '',
        'app.nodeEnv': 'production',
      }),
    );

    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('nao registra nada quando o segredo esta configurado', () => {
    loggerWarn.mockClear();
    loggerError.mockClear();

    new FormTokenService(configService());

    expect(loggerWarn).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});
