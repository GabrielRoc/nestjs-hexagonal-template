import { ExecutionContext, HttpStatus } from '@nestjs/common';
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
      getRequest: () => ({ body }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ExecutionContext;

  return { context, status, json, sent };
}

describe('HoneypotGuard', () => {
  let guard: HoneypotGuard;

  beforeEach(() => {
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
});
