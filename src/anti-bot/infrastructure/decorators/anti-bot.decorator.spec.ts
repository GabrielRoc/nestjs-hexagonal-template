import 'reflect-metadata';
import { CanActivate, ExecutionContext, Logger, Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AntiBot } from './anti-bot.decorator';
import {
  CHALLENGE_ANSWER_FIELD,
  FORM_TOKEN_HEADER,
  TURNSTILE_FIELD,
} from '../../anti-bot.constants';
import type { ChallengeResourceResolver } from '../../domain/ports/challenge-resource.port';
import { ChallengeGuard } from '../guards/challenge.guard';
import { FormTokenConsumeGuard } from '../guards/form-token-consume.guard';
import { FormTokenGuard } from '../guards/form-token.guard';
import { HoneypotGuard } from '../guards/honeypot.guard';
import { TimingGuard } from '../guards/timing.guard';
import { TurnstileGuard } from '../guards/turnstile.guard';
import { InMemoryTokenStore } from '../persistence/in-memory-token-store';
import { FormTokenService } from '../services/form-token.service';
import { TurnstileVerifyService } from '../services/turnstile-verify.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

const NOW = 1_700_000_000_000;
const MIN_MS = 2_000;
const MAX_MS = 1_800_000;
const EXPECTED_ANSWER = 'fluffy';

/** Rota de exemplo, decorada exatamente como a documentacao manda. */
class ProtectedController {
  @AntiBot({ challengeParam: 'slug' })
  create(): string {
    return 'handler';
  }
}

/** A ordem que o `@AntiBot()` realmente registrou — e a que o Nest vai ativar. */
const GUARD_ORDER = Reflect.getMetadata(
  GUARDS_METADATA,
  ProtectedController.prototype.create,
) as Type<CanActivate>[];

function configService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'antiBot.tokenSecret': 'a'.repeat(64),
    'antiBot.minTimeMs': MIN_MS,
    'antiBot.maxTimeMs': MAX_MS,
    'antiBot.turnstileEnabled': false,
    'app.nodeEnv': 'test',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

interface Stack {
  instances: Map<Type<CanActivate>, CanActivate>;
  formTokenService: FormTokenService;
  store: InMemoryTokenStore;
  markUsed: jest.SpyInstance;
  turnstileVerify: jest.Mocked<Pick<TurnstileVerifyService, 'verify'>>;
}

/**
 * Monta o stack inteiro com servico e store REAIS (o form token e o uso unico sao
 * o que esta sob teste) e mocka so a borda de rede do Turnstile e o resolver do
 * desafio, que num template nao tem implementacao.
 */
function buildStack({ turnstileEnabled = false } = {}): Stack {
  const config = configService({
    'antiBot.turnstileEnabled': turnstileEnabled,
  });
  const formTokenService = new FormTokenService(config);
  const store = new InMemoryTokenStore();
  const turnstileVerify: jest.Mocked<Pick<TurnstileVerifyService, 'verify'>> = {
    verify: jest.fn().mockResolvedValue(true),
  };
  const resolver: ChallengeResourceResolver = {
    findProtection: jest.fn().mockResolvedValue({
      protectionLevel: 'challenge',
      expectedAnswer: EXPECTED_ANSWER,
    }),
  };

  const instances = new Map<Type<CanActivate>, CanActivate>([
    [HoneypotGuard, new HoneypotGuard()],
    [FormTokenGuard, new FormTokenGuard(formTokenService)],
    [TimingGuard, new TimingGuard(config)],
    [
      TurnstileGuard,
      new TurnstileGuard(
        config,
        turnstileVerify as unknown as TurnstileVerifyService,
      ),
    ],
    [ChallengeGuard, new ChallengeGuard(new Reflector(), resolver)],
    [FormTokenConsumeGuard, new FormTokenConsumeGuard(store)],
  ]);

  return {
    instances,
    formTokenService,
    store,
    markUsed: jest.spyOn(store, 'markUsed'),
    turnstileVerify,
  };
}

function makeContext({
  token,
  answer = EXPECTED_ANSWER,
  honeypot,
}: {
  token?: string;
  answer?: string;
  honeypot?: string;
}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/things/festa/messages',
    params: { slug: 'festa' },
    headers: token ? { [FORM_TOKEN_HEADER]: token } : {},
    body: {
      message: 'oi',
      [CHALLENGE_ANSWER_FIELD]: answer,
      [TURNSTILE_FIELD]: 'turnstile-token',
      ...(honeypot === undefined ? {} : { website: honeypot }),
    },
  } as unknown as Request;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }) as unknown as Response,
    }),
    getHandler: () => ProtectedController.prototype.create,
    getClass: () => ProtectedController,
  } as unknown as ExecutionContext;
}

/** Roda os guards na ordem registrada pelo decorator. `false` = requisicao barrada. */
async function runStack(
  stack: Stack,
  context: ExecutionContext,
): Promise<boolean> {
  for (const guardClass of GUARD_ORDER) {
    const guard = stack.instances.get(guardClass);
    if (!guard) {
      throw new Error(`guard sem instancia no teste: ${guardClass.name}`);
    }
    const allowed = (await guard.canActivate(context)) as boolean;
    if (!allowed) {
      return false;
    }
  }
  return true;
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

describe('@AntiBot()', () => {
  let now: number;

  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registra as camadas na ordem contratada, com o consumo do token por ultimo', () => {
    // A ordem NAO e cosmetica: o Nest ativa os guards na ordem deste array, e o
    // consumo do token e irreversivel. Se alguem reordenar, este teste quebra
    // antes de o usuario descobrir que um typo tranca o formulario.
    expect(GUARD_ORDER).toEqual([
      HoneypotGuard,
      FormTokenGuard,
      TimingGuard,
      TurnstileGuard,
      ChallengeGuard,
      FormTokenConsumeGuard,
    ]);
    expect(GUARD_ORDER[GUARD_ORDER.length - 1]).toBe(FormTokenConsumeGuard);
  });

  it('resposta de desafio errada NAO gasta o token: corrigir e reenviar o mesmo formulario passa', async () => {
    const stack = buildStack();
    const { token } = stack.formTokenService.issue('messages');

    // Usuario preenche em 5s e erra a resposta por um typo.
    now = NOW + 5_000;
    const error = await catchDomainException(() =>
      runStack(stack, makeContext({ token, answer: 'flufy' })),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT);
    expect(stack.markUsed).not.toHaveBeenCalled();

    // Corrige o typo e reenvia o MESMO formulario (mesmo token), que e exatamente
    // o que a mensagem "Tente novamente" pede.
    await expect(
      runStack(stack, makeContext({ token, answer: EXPECTED_ANSWER })),
    ).resolves.toBe(true);
    expect(stack.markUsed).toHaveBeenCalledTimes(1);
  });

  it('mantem o uso unico depois da tentativa aceita', async () => {
    const stack = buildStack();
    const { token } = stack.formTokenService.issue('messages');

    now = NOW + 5_000;
    await runStack(stack, makeContext({ token }));

    const error = await catchDomainException(() =>
      runStack(stack, makeContext({ token })),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
  });

  it('falha do Turnstile NAO gasta o token: a tentativa seguinte com o mesmo token passa', async () => {
    const stack = buildStack({ turnstileEnabled: true });
    const { token } = stack.formTokenService.issue('messages');
    // Timeout de rede na Cloudflare com TURNSTILE_FAIL_OPEN=false.
    stack.turnstileVerify.verify.mockResolvedValueOnce(false);

    now = NOW + 5_000;
    const error = await catchDomainException(() =>
      runStack(stack, makeContext({ token })),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CAPTCHA_FAILED);
    expect(stack.markUsed).not.toHaveBeenCalled();

    await expect(runStack(stack, makeContext({ token }))).resolves.toBe(true);
  });

  it('submit instantaneo e barrado com sucesso falso, sem gastar o token', async () => {
    const stack = buildStack();
    const { token } = stack.formTokenService.issue('messages');

    // Sem avancar o relogio: idade 0 pelo `iat` assinado.
    const allowed = await runStack(stack, makeContext({ token }));

    expect(allowed).toBe(false);
    expect(stack.markUsed).not.toHaveBeenCalled();
  });

  it('isca preenchida e barrada com sucesso falso, sem gastar o token', async () => {
    const stack = buildStack();
    const { token } = stack.formTokenService.issue('messages');

    now = NOW + 5_000;
    const allowed = await runStack(
      stack,
      makeContext({ token, honeypot: 'http://spam.example' }),
    );

    expect(allowed).toBe(false);
    expect(stack.markUsed).not.toHaveBeenCalled();
  });

  it('POST direto sem form token nao chega a chamar a Cloudflare', async () => {
    const stack = buildStack({ turnstileEnabled: true });

    now = NOW + 5_000;
    const error = await catchDomainException(() =>
      runStack(stack, makeContext({})),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID);
    // Verificar o token e barato e vem antes da rede: bot sem token nao vira
    // chamada externa (nem custo, nem quota da Cloudflare).
    expect(stack.turnstileVerify.verify).not.toHaveBeenCalled();
  });
});
