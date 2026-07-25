import { ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { HoneypotGuard } from './honeypot.guard';
import { HONEYPOT_FIELD } from '../../anti-bot.constants';

function makeContext(body: unknown) {
  const sent: unknown[] = [];
  const json = jest.fn((payload: unknown) => {
    sent.push(payload);
  });
  const status = jest.fn().mockReturnValue({ json });
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/v1/contact',
        body,
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ExecutionContext;

  return { context, status, json, sent };
}

/** Primeiro argumento da primeira chamada do spy, como texto. */
function firstMessage(spy: jest.SpyInstance): string {
  const calls = spy.mock.calls as unknown[][];
  return String(calls[0][0]);
}

describe('HoneypotGuard', () => {
  let guard: HoneypotGuard;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    // O descarte por sucesso falso e logado; o spy silencia e serve de assercao.
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    guard = new HoneypotGuard();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve sucesso falso e bloqueia quando a isca vem preenchida', () => {
    const { context, status, json } = makeContext({
      [HONEYPOT_FIELD]: 'http://spam.example',
      email: 'bot@example.com',
    });

    expect(guard.canActivate(context)).toBe(false);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(json).toHaveBeenCalledWith({ data: { success: true } });
  });

  it('nao entrega no corpo nem no status que a requisicao foi bloqueada', () => {
    const { status, sent, context } = makeContext({ [HONEYPOT_FIELD]: 'x' });

    guard.canActivate(context);

    expect(status).not.toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(JSON.stringify(sent[0])).not.toMatch(/error|bot|honeypot|website/i);
  });

  it('passa quando a isca vem vazia — navegador real envia o campo escondido vazio', () => {
    const { context, status } = makeContext({
      [HONEYPOT_FIELD]: '',
      email: 'joao@example.com',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('passa quando a isca nao vem no corpo', () => {
    const { context, status } = makeContext({ email: 'joao@example.com' });

    expect(guard.canActivate(context)).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('passa quando nao ha corpo', () => {
    expect(guard.canActivate(makeContext(undefined).context)).toBe(true);
  });

  it('loga o descarte (a rota e o motivo) sem vazar o valor do campo', () => {
    const { context } = makeContext({
      [HONEYPOT_FIELD]: 'http://spam.example',
      email: 'bot@example.com',
    });

    guard.canActivate(context);

    // O 200 falso nao deixa rastro nenhum no handler; sem este log, um autofill
    // do navegador descartando submissao de gente seria invisivel.
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const message = firstMessage(loggerWarn);
    expect(message).toContain('honeypot-field-filled');
    expect(message).toContain('POST /api/v1/contact');
    expect(message).not.toContain('spam.example');
    expect(message).not.toContain('bot@example.com');
  });

  it('nao loga nada quando a requisicao passa', () => {
    guard.canActivate(makeContext({ email: 'joao@example.com' }).context);

    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
