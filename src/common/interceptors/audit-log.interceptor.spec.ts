import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { SKIP_AUDIT_BODY_KEY } from '../constants';
import type { AuditLogRepositoryPort } from '../../audit-log/domain/ports/audit-log.repository.port';
import { AuditLog } from '../../audit-log/domain/entities/audit-log.entity';
import { Role } from '../enums/role.enum';

type RepoMock = jest.Mocked<Pick<AuditLogRepositoryPort, 'save'>>;

const USER = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: Role.ADMIN,
  supertokensUserId: 'st-1',
};

function makeContext(overrides: {
  method?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string>;
  user?: typeof USER | undefined;
}): ExecutionContext {
  const request = {
    method: overrides.method ?? 'PATCH',
    path:
      overrides.path ?? '/api/v1/users/3f1c9f4a-1111-4222-8333-444455556666',
    body: overrides.body,
    params: overrides.params ?? {},
    user: 'user' in overrides ? overrides.user : USER,
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'user-agent': 'jest' },
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

const nextOf = (value: unknown): CallHandler => ({
  handle: () => of(value),
});

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let repo: RepoMock;
  let reflector: Reflector;

  function savedLog(): AuditLog {
    expect(repo.save).toHaveBeenCalledTimes(1);
    return repo.save.mock.calls[0][0];
  }

  function savedChangesAfter(): Record<string, unknown> | undefined {
    return savedLog().changes.after as Record<string, unknown> | undefined;
  }

  beforeEach(() => {
    repo = { save: jest.fn((log: AuditLog) => Promise.resolve(log)) };
    reflector = new Reflector();
    interceptor = new AuditLogInterceptor(repo, reflector);
    jest
      .spyOn(interceptor['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redige newPassword no corpo auditado', async () => {
    // A rota administrativa de troca de senha usa `newPassword`, que a versao
    // anterior (denylist de `password`/`token`/`secret`) gravava em claro na
    // coluna jsonb audit_logs.changes.
    const context = makeContext({ body: { newPassword: 'S3nhaForte1' } });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(savedChangesAfter()).toEqual({ newPassword: '[REDACTED]' });
    expect(JSON.stringify(savedLog())).not.toContain('S3nhaForte1');
  });

  it('redige confirmPassword e token juntos preservando os campos inocuos', async () => {
    const context = makeContext({
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      body: {
        token: 'tok-123',
        newPassword: 'S3nhaForte1',
        confirmPassword: 'S3nhaForte1',
        email: 'joao@email.com',
      },
    });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(savedChangesAfter()).toEqual({
      token: '[REDACTED]',
      newPassword: '[REDACTED]',
      confirmPassword: '[REDACTED]',
      email: 'joao@email.com',
    });
  });

  it('redige chave sensivel aninhada em objeto e em array', async () => {
    const context = makeContext({
      body: {
        profile: { name: 'João', apiSecret: 'abc' },
        integrations: [{ refreshToken: 'r1' }, { label: 'ok' }],
      },
    });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(savedChangesAfter()).toEqual({
      profile: { name: 'João', apiSecret: '[REDACTED]' },
      integrations: [{ refreshToken: '[REDACTED]' }, { label: 'ok' }],
    });
  });

  it('redige o valor inteiro quando a propria chave e sensivel', async () => {
    // Nao desce dentro de `credentials`: o objeto todo e o segredo.
    const context = makeContext({
      body: { credentials: { user: 'joao', pwd: 'abc' } },
    });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(savedChangesAfter()).toEqual({ credentials: '[REDACTED]' });
  });

  it('nao grava corpo nenhum quando a rota usa @SkipAuditBody', async () => {
    const context = makeContext({ body: { newPassword: 'S3nhaForte1' } });
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === SKIP_AUDIT_BODY_KEY ? true : undefined,
      );

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(savedChangesAfter()).toBeUndefined();
    // O evento continua auditado: quem, o que e onde.
    expect(savedLog()).toMatchObject({
      action: 'UPDATE',
      userId: USER.userId,
      tenantId: USER.tenantId,
    });
  });

  it('nao grava corpo em DELETE', async () => {
    const context = makeContext({
      method: 'DELETE',
      params: { id: 'user-9' },
      body: { newPassword: 'S3nhaForte1' },
    });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf(undefined)).subscribe(resolve),
    );

    expect(savedChangesAfter()).toBeUndefined();
  });

  it('nao audita requisicao sem usuario autenticado', async () => {
    const context = makeContext({
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      body: { newPassword: 'S3nhaForte1' },
      user: undefined,
    });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('nao audita metodo de leitura', async () => {
    const context = makeContext({ method: 'GET' });

    await new Promise((resolve) =>
      interceptor.intercept(context, nextOf({ data: {} })).subscribe(resolve),
    );

    expect(repo.save).not.toHaveBeenCalled();
  });
});
