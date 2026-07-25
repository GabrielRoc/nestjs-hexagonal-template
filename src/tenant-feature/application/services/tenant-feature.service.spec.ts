import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import { FeatureKey } from '../../domain/enums/feature-key.enum';
import type { TenantFeatureCachePort } from '../../domain/ports/tenant-feature-cache.port';
import type { TenantFeatureRepositoryPort } from '../../domain/ports/tenant-feature.repository.port';
import { TenantFeatureService } from './tenant-feature.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

/** Cache passthrough: isola o servico do comportamento de TTL do adapter. */
function noopCache(): TenantFeatureCachePort {
  return {
    get: () => null,
    set: () => undefined,
    invalidate: () => undefined,
  };
}

describe('TenantFeatureService', () => {
  let repo: jest.Mocked<Pick<TenantFeatureRepositoryPort, 'findByTenantId'>>;
  let service: TenantFeatureService;

  beforeEach(() => {
    repo = { findByTenantId: jest.fn().mockResolvedValue([]) };
    service = new TenantFeatureService(
      repo as unknown as TenantFeatureRepositoryPort,
      noopCache(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trata chave sem linha persistida como habilitada', async () => {
    await expect(service.isFeatureEnabled(TENANT_ID, 'EXPORT')).resolves.toBe(
      true,
    );
  });

  it('respeita enabled: false persistido', async () => {
    repo.findByTenantId.mockResolvedValue([
      new TenantFeature({
        tenantId: TENANT_ID,
        featureKey: 'EXPORT',
        enabled: false,
      }),
    ]);

    await expect(service.isFeatureEnabled(TENANT_ID, 'EXPORT')).resolves.toBe(
      false,
    );
  });

  it('nao confunde chaves diferentes do mesmo tenant', async () => {
    repo.findByTenantId.mockResolvedValue([
      new TenantFeature({
        tenantId: TENANT_ID,
        featureKey: 'EXPORT',
        enabled: false,
      }),
    ]);

    await expect(service.isFeatureEnabled(TENANT_ID, 'GALLERY')).resolves.toBe(
      true,
    );
  });

  it('devolve o limite numerico, e null quando nao ha linha', async () => {
    repo.findByTenantId.mockResolvedValue([
      new TenantFeature({
        tenantId: TENANT_ID,
        featureKey: 'MAX_ITEMS',
        numericValue: 10,
      }),
    ]);

    await expect(service.getNumericLimit(TENANT_ID, 'MAX_ITEMS')).resolves.toBe(
      10,
    );
    await expect(
      service.getNumericLimit(TENANT_ID, 'OUTRA'),
    ).resolves.toBeNull();
  });

  describe('getAllFeatures', () => {
    it('nao inventa chaves quando FeatureKey esta vazio', async () => {
      // Guarda de regressao para o enum vazio do template: sem linha persistida
      // e sem chave declarada, a resposta e vazia — nao uma lista de chaves de
      // outro produto.
      expect(Object.values(FeatureKey)).toHaveLength(0);

      await expect(service.getAllFeatures(TENANT_ID)).resolves.toEqual([]);
    });

    it('inclui chave persistida que nao esta declarada em FeatureKey', async () => {
      repo.findByTenantId.mockResolvedValue([
        new TenantFeature({
          tenantId: TENANT_ID,
          featureKey: 'LEGACY',
          enabled: false,
          numericValue: 5,
        }),
      ]);

      await expect(service.getAllFeatures(TENANT_ID)).resolves.toEqual([
        { featureKey: 'LEGACY', enabled: false, numericValue: 5 },
      ]);
    });
  });

  it('nega, em vez de consultar o banco, quando o tenantId e vazio', async () => {
    // Caso real: SUPERADMIN em GET /v1/tenant-features/me — o middleware o cria
    // com tenantId: ''. Sem a guarda, a query iria ao banco com '' e viraria 500.
    const promise = service.getAllFeatures('');

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
      expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
    });
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('propaga a invalidacao para o cache', () => {
    const cache = noopCache();
    const invalidate = jest.spyOn(cache, 'invalidate');
    const withCache = new TenantFeatureService(
      repo as unknown as TenantFeatureRepositoryPort,
      cache,
    );

    withCache.invalidateCache(TENANT_ID);

    expect(invalidate).toHaveBeenCalledWith(TENANT_ID);
  });
});
