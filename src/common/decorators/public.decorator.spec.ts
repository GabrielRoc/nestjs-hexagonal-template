import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicAccess, SuperTokensAuthGuard } from 'supertokens-nestjs';
import { Public } from './public.decorator';
import { IS_PUBLIC_KEY } from '../constants';

class SampleController {
  @Public()
  publicHandler(): void {}

  protectedHandler(): void {}
}

const publicHandler = SampleController.prototype.publicHandler;
const protectedHandler = SampleController.prototype.protectedHandler;

function contextFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => SampleController,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('Public', () => {
  const reflector = new Reflector();

  it('grava IS_PUBLIC_KEY, lido por RolesGuard e TenantGuard', () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, publicHandler)).toBe(true);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, protectedHandler)).toBe(
      undefined,
    );
  });

  it('grava tambem a chave do PublicAccess, lida pelo SuperTokensAuthGuard', () => {
    // PublicAccess e um Reflector.createDecorator(): a chave e o proprio
    // decorator, nao IS_PUBLIC_KEY. As duas sao independentes.
    expect(reflector.get(PublicAccess, publicHandler)).toBeTruthy();
    expect(reflector.get(PublicAccess, protectedHandler)).toBe(undefined);
  });

  it('faz o SuperTokensAuthGuard liberar a rota sem sessao', async () => {
    // Guard real, sem SuperTokens inicializado: se a chave do PublicAccess
    // faltar, canActivate cai em getSession() e rejeita.
    const guard = new SuperTokensAuthGuard();

    await expect(guard.canActivate(contextFor(publicHandler))).resolves.toBe(
      true,
    );
  });

  it('nao libera um handler sem @Public()', async () => {
    const guard = new SuperTokensAuthGuard();

    // Sem o marcador, o guard segue para getSession() em vez de liberar: aqui
    // isso falha porque o SuperTokens nao foi inicializado no teste, o que ja
    // prova que a rota nao foi tratada como publica.
    await expect(
      guard.canActivate(contextFor(protectedHandler)),
    ).rejects.toThrow(/initialisation not done/i);
  });
});
