import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnstileVerifyService } from './turnstile-verify.service';

function configService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'antiBot.turnstileSecretKey': 'secret-key',
    'antiBot.turnstileFailOpen': true,
    'antiBot.turnstileEnabled': true,
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  } as unknown as ConfigService;
}

function mockFetch(response: unknown): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response as Response);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('TurnstileVerifyService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita quando a Cloudflare responde success=true', async () => {
    mockFetch(jsonResponse({ success: true }));
    const service = new TurnstileVerifyService(configService());

    await expect(service.verify('tk')).resolves.toBe(true);
  });

  it('rejeita quando a Cloudflare responde success=false', async () => {
    mockFetch(
      jsonResponse({ success: false, 'error-codes': ['timeout-or-dup'] }),
    );
    const service = new TurnstileVerifyService(configService());

    await expect(service.verify('tk')).resolves.toBe(false);
  });

  it('envia secret, token e IP no formato que a Cloudflare espera', async () => {
    const fetchSpy = mockFetch(jsonResponse({ success: true }));
    const service = new TurnstileVerifyService(configService());

    await service.verify('tk', '10.0.0.9');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('challenges.cloudflare.com');
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get('secret')).toBe('secret-key');
    expect(sent.get('response')).toBe('tk');
    expect(sent.get('remoteip')).toBe('10.0.0.9');
    // Sem timeout, uma chamada pendurada seguraria a requisicao do usuario.
    expect(init.signal).toBeDefined();
  });

  it('omite remoteip quando o IP nao esta disponivel', async () => {
    const fetchSpy = mockFetch(jsonResponse({ success: true }));
    const service = new TurnstileVerifyService(configService());

    await service.verify('tk');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).has('remoteip')).toBe(
      false,
    );
  });

  it('fail-open: libera quando a chamada falha', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const service = new TurnstileVerifyService(configService());

    await expect(service.verify('tk')).resolves.toBe(true);
  });

  it('fail-closed: rejeita quando a chamada falha e TURNSTILE_FAIL_OPEN=false', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const service = new TurnstileVerifyService(
      configService({ 'antiBot.turnstileFailOpen': false }),
    );

    await expect(service.verify('tk')).resolves.toBe(false);
  });

  it('aplica a politica de falha em HTTP nao-2xx', async () => {
    mockFetch(jsonResponse({}, false, 503));
    const failClosed = new TurnstileVerifyService(
      configService({ 'antiBot.turnstileFailOpen': false }),
    );

    await expect(failClosed.verify('tk')).resolves.toBe(false);
  });

  it('nao trata corpo inesperado como sucesso', async () => {
    mockFetch(jsonResponse({ success: 'yes' }));
    const failClosed = new TurnstileVerifyService(
      configService({ 'antiBot.turnstileFailOpen': false }),
    );

    await expect(failClosed.verify('tk')).resolves.toBe(false);
  });

  it('avisa no boot quando esta ligado sem secret', () => {
    const error = jest.spyOn(Logger.prototype, 'error');

    new TurnstileVerifyService(
      configService({ 'antiBot.turnstileSecretKey': '' }),
    );

    expect(error).toHaveBeenCalledTimes(1);
  });
});
