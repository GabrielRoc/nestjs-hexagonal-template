import { ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ChallengeGuard } from './challenge.guard';
import { CHALLENGE_ANSWER_FIELD } from '../../anti-bot.constants';
import type {
  ChallengeProtectedResource,
  ChallengeResourceResolver,
} from '../../domain/ports/challenge-resource.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

type ResolverMock = jest.Mocked<
  Pick<ChallengeResourceResolver, 'findProtection'>
>;

const PROTECTED: ChallengeProtectedResource = {
  protectionLevel: 'challenge',
  expectedAnswer: 'Fluffy',
};

function makeContext(
  params: Record<string, string>,
  body?: unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, body }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
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

describe('ChallengeGuard', () => {
  let reflector: Reflector;
  let resolver: ResolverMock;

  function guardWith(
    boundResolver: ResolverMock | undefined,
    challengeParam?: string,
  ): ChallengeGuard {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(challengeParam);
    return new ChallengeGuard(reflector, boundResolver);
  }

  beforeEach(() => {
    reflector = new Reflector();
    resolver = { findProtection: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passa direto quando nenhum resolver esta ligado (clone novo do template)', async () => {
    const guard = guardWith(undefined, 'slug');

    await expect(
      guard.canActivate(makeContext({ slug: 'festa' }, {})),
    ).resolves.toBe(true);
  });

  it('nao consulta nada quando a rota nao declara challengeParam', async () => {
    const guard = guardWith(resolver, undefined);

    await expect(
      guard.canActivate(makeContext({ slug: 'festa' }, {})),
    ).resolves.toBe(true);
    expect(resolver.findProtection).not.toHaveBeenCalled();
  });

  it('passa quando o parametro declarado nao veio na rota', async () => {
    const guard = guardWith(resolver, 'slug');

    await expect(guard.canActivate(makeContext({}, {}))).resolves.toBe(true);
    expect(resolver.findProtection).not.toHaveBeenCalled();
  });

  it('passa quando o recurso nao existe, sem virar oraculo de existencia', async () => {
    resolver.findProtection.mockResolvedValue(null);
    const guard = guardWith(resolver, 'slug');

    await expect(
      guard.canActivate(makeContext({ slug: 'nao-existe' }, {})),
    ).resolves.toBe(true);
  });

  it('passa quando o recurso nao pede desafio', async () => {
    resolver.findProtection.mockResolvedValue({
      protectionLevel: 'none',
      expectedAnswer: null,
    });
    const guard = guardWith(resolver, 'slug');

    await expect(
      guard.canActivate(makeContext({ slug: 'festa' }, {})),
    ).resolves.toBe(true);
  });

  it('rejeita quando a resposta nao vem', async () => {
    resolver.findProtection.mockResolvedValue(PROTECTED);
    const guard = guardWith(resolver, 'slug');

    const error = await catchDomainException(() =>
      guard.canActivate(makeContext({ slug: 'festa' }, {})),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT);
    expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rejeita resposta errada', async () => {
    resolver.findProtection.mockResolvedValue(PROTECTED);
    const guard = guardWith(resolver, 'slug');

    const error = await catchDomainException(() =>
      guard.canActivate(
        makeContext({ slug: 'festa' }, { [CHALLENGE_ANSWER_FIELD]: 'rex' }),
      ),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT);
  });

  it('aceita a resposta correta ignorando caixa e espaco em volta', async () => {
    resolver.findProtection.mockResolvedValue(PROTECTED);
    const guard = guardWith(resolver, 'slug');

    await expect(
      guard.canActivate(
        makeContext(
          { slug: 'festa' },
          { [CHALLENGE_ANSWER_FIELD]: '  fLuFfY ' },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejeita quando o recurso pede desafio sem resposta cadastrada', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    resolver.findProtection.mockResolvedValue({
      protectionLevel: 'challenge',
      expectedAnswer: '   ',
    });
    const guard = guardWith(resolver, 'slug');

    // Falha fechada: liberar aqui desligaria em silencio a protecao que o dono
    // do recurso pediu.
    const error = await catchDomainException(() =>
      guard.canActivate(
        makeContext({ slug: 'festa' }, { [CHALLENGE_ANSWER_FIELD]: 'fluffy' }),
      ),
    );

    expect(error.code).toBe(ErrorCode.ANTI_BOT_CHALLENGE_INCORRECT);
  });

  it('repassa null como tenantId em rota publica', async () => {
    resolver.findProtection.mockResolvedValue(PROTECTED);
    const guard = guardWith(resolver, 'slug');

    await guard.canActivate(
      makeContext({ slug: 'festa' }, { [CHALLENGE_ANSWER_FIELD]: 'fluffy' }),
    );

    expect(resolver.findProtection).toHaveBeenCalledWith('festa', null);
  });
});
