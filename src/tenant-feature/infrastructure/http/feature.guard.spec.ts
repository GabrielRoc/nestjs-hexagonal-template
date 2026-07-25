import { HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { RequestUser } from '../../../common/interfaces';
import { TenantFeatureService } from '../../application/services/tenant-feature.service';
import { BulkUpdateTenantFeaturesUseCase } from '../../application/use-cases/bulk-update-tenant-features.use-case';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureRepositoryPort } from '../../domain/ports/tenant-feature.repository.port';
import { InMemoryTenantFeatureCache } from '../cache/in-memory-tenant-feature.cache';
import { FeatureGuard } from './feature.guard';
import { RequiresFeature } from './requires-feature.decorator';

// O enum FeatureKey e entregue vazio, entao @RequiresFeature() nao tem argumento
// valido para receber. O cast reproduz o que um projeto real faz depois de
// declarar as chaves dele, sem precisar mexer no enum do template.
const EXPORT_FEATURE = 'EXPORT' as never;
const TENANT_ID = '11111111-1111-4111-8111-111111111111';

class ProtectedController {
  @RequiresFeature(EXPORT_FEATURE)
  gated(): void {}

  ungated(): void {}
}

const gatedHandler = ProtectedController.prototype.gated;
const ungatedHandler = ProtectedController.prototype.ungated;

function contextFor(
  handler: () => void,
  user?: Partial<RequestUser>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ProtectedController,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        url: '/api/v1/exports',
        ...(user ? { user } : {}),
      }),
    }),
  } as unknown as ExecutionContext;
}

function feature(enabled: boolean): TenantFeature {
  return new TenantFeature({
    tenantId: TENANT_ID,
    featureKey: 'EXPORT',
    enabled,
  });
}

/** ConfigService que devolve sempre undefined: o cache cai nos defaults. */
const defaultConfig = {
  get: () => undefined,
} as unknown as ConfigService;

describe('FeatureGuard', () => {
  let repo: jest.Mocked<
    Pick<TenantFeatureRepositoryPort, 'findByTenantId' | 'bulkUpsert'>
  >;
  let cache: InMemoryTenantFeatureCache;
  let service: TenantFeatureService;
  let guard: FeatureGuard;

  beforeEach(() => {
    repo = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      bulkUpsert: jest.fn().mockResolvedValue([]),
    };
    cache = new InMemoryTenantFeatureCache(defaultConfig);
    service = new TenantFeatureService(repo, cache);
    guard = new FeatureGuard(new Reflector(), service);
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('libera rota sem @RequiresFeature() sem tocar no repositorio', async () => {
    await expect(guard.canActivate(contextFor(ungatedHandler))).resolves.toBe(
      true,
    );

    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('libera quando a feature esta habilitada', async () => {
    repo.findByTenantId.mockResolvedValue([feature(true)]);

    await expect(
      guard.canActivate(
        contextFor(gatedHandler, { role: Role.USER, tenantId: TENANT_ID }),
      ),
    ).resolves.toBe(true);

    expect(repo.findByTenantId).toHaveBeenCalledWith(TENANT_ID);
  });

  it('libera quando a feature nao tem linha persistida (default habilitado)', async () => {
    repo.findByTenantId.mockResolvedValue([]);

    await expect(
      guard.canActivate(
        contextFor(gatedHandler, { role: Role.USER, tenantId: TENANT_ID }),
      ),
    ).resolves.toBe(true);
  });

  it('bloqueia com FEATURE_DISABLED e 403 quando a feature esta desligada', async () => {
    repo.findByTenantId.mockResolvedValue([feature(false)]);

    const promise = guard.canActivate(
      contextFor(gatedHandler, { role: Role.USER, tenantId: TENANT_ID }),
    );

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.FEATURE_DISABLED);
      expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
    });
  });

  it('nega, em vez de liberar, quando nao ha request.user', async () => {
    const promise = guard.canActivate(contextFor(gatedHandler));

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
      expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
    });
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('nega quando o usuario nao tem tenantId', async () => {
    const promise = guard.canActivate(
      contextFor(gatedHandler, { role: Role.ADMIN, tenantId: '' }),
    );

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
    });
  });

  it('libera SUPERADMIN sem tenantId antes de checar o tenant', async () => {
    // O tenant-context.middleware atribui tenantId: '' ao superadmin. A ordem
    // do bypass e o que impede ele de cair no ramo de tenant ausente.
    repo.findByTenantId.mockResolvedValue([feature(false)]);

    await expect(
      guard.canActivate(
        contextFor(gatedHandler, { role: Role.SUPERADMIN, tenantId: '' }),
      ),
    ).resolves.toBe(true);

    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  describe('cache', () => {
    it('consulta o repositorio uma vez para duas requisicoes', async () => {
      repo.findByTenantId.mockResolvedValue([feature(true)]);
      const context = contextFor(gatedHandler, {
        role: Role.USER,
        tenantId: TENANT_ID,
      });

      await guard.canActivate(context);
      await guard.canActivate(context);

      expect(repo.findByTenantId).toHaveBeenCalledTimes(1);
    });

    it('volta ao repositorio depois do bulk update do tenant', async () => {
      repo.findByTenantId.mockResolvedValue([feature(true)]);
      const context = contextFor(gatedHandler, {
        role: Role.USER,
        tenantId: TENANT_ID,
      });
      const bulkUpdate = new BulkUpdateTenantFeaturesUseCase(repo, service);

      await guard.canActivate(context);
      expect(repo.findByTenantId).toHaveBeenCalledTimes(1);

      repo.findByTenantId.mockResolvedValue([feature(false)]);
      await bulkUpdate.execute(TENANT_ID, {
        features: [{ featureKey: 'EXPORT', enabled: false }],
      });

      // Sem a invalidacao, esta chamada seria servida do cache e liberaria uma
      // feature ja desligada ate o TTL vencer.
      const promise = guard.canActivate(context);
      await expect(promise).rejects.toThrow(DomainException);
      await promise.catch((error: DomainException) => {
        expect(error.code).toBe(ErrorCode.FEATURE_DISABLED);
        expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
      });
      expect(repo.findByTenantId).toHaveBeenCalledTimes(2);
    });

    it('nao invalida o cache de outro tenant', async () => {
      const otherTenantId = '22222222-2222-4222-8222-222222222222';
      repo.findByTenantId.mockResolvedValue([feature(true)]);
      const otherContext = contextFor(gatedHandler, {
        role: Role.USER,
        tenantId: otherTenantId,
      });
      const bulkUpdate = new BulkUpdateTenantFeaturesUseCase(repo, service);

      await guard.canActivate(otherContext);
      await bulkUpdate.execute(TENANT_ID, {
        features: [{ featureKey: 'EXPORT', enabled: false }],
      });
      await guard.canActivate(otherContext);

      expect(repo.findByTenantId).toHaveBeenCalledTimes(1);
      expect(repo.findByTenantId).toHaveBeenCalledWith(otherTenantId);
    });
  });
});
