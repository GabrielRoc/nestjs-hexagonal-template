import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { Tenant } from '../../../tenant/domain/entities/tenant.entity';
import type { TenantRepositoryPort } from '../../../tenant/domain/ports/tenant.repository.port';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureCachePort } from '../../domain/ports/tenant-feature-cache.port';
import type { TenantFeatureRepositoryPort } from '../../domain/ports/tenant-feature.repository.port';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { GetTenantFeaturesUseCase } from './get-tenant-features.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function noopCache(): TenantFeatureCachePort {
  return {
    get: () => null,
    set: () => undefined,
    invalidate: () => undefined,
  };
}

describe('GetTenantFeaturesUseCase', () => {
  let repo: jest.Mocked<Pick<TenantFeatureRepositoryPort, 'findByTenantId'>>;
  let tenantRepo: jest.Mocked<Pick<TenantRepositoryPort, 'findById'>>;
  let useCase: GetTenantFeaturesUseCase;

  beforeEach(() => {
    repo = { findByTenantId: jest.fn().mockResolvedValue([]) };
    tenantRepo = {
      findById: jest.fn().mockResolvedValue(
        new Tenant({
          id: TENANT_ID,
          name: 'Tenant',
          document: '00000000000',
          email: 'tenant@example.com',
          phone: '11999999999',
        }),
      ),
    };
    useCase = new GetTenantFeaturesUseCase(
      new TenantFeatureService(
        repo as unknown as TenantFeatureRepositoryPort,
        noopCache(),
      ),
      tenantRepo as unknown as TenantRepositoryPort,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve as flags do tenant existente', async () => {
    repo.findByTenantId.mockResolvedValue([
      new TenantFeature({
        tenantId: TENANT_ID,
        featureKey: 'EXPORT',
        enabled: false,
        numericValue: 5,
      }),
    ]);

    await expect(useCase.execute(TENANT_ID)).resolves.toEqual([
      { featureKey: 'EXPORT', enabled: false, numericValue: 5 },
    ]);
  });

  it('recusa tenant inexistente com TENANT_NOT_FOUND e 404, sem ler flags', async () => {
    // Sem isto o GET respondia 200 afirmando o estado das flags de um tenant
    // que nao existe (e ocupando entrada no cache).
    tenantRepo.findById.mockResolvedValue(null);

    const promise = useCase.execute(TENANT_ID);

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.TENANT_NOT_FOUND);
      expect(error.httpStatus).toBe(HttpStatus.NOT_FOUND);
    });
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('nega tenantId vazio antes de consultar o repositorio de tenants', async () => {
    // Caso real: SUPERADMIN em GET /v1/tenant-features/me — o middleware o cria
    // com tenantId: ''. Um findById('') viraria 22P02 no Postgres, ou seja 500.
    const promise = useCase.execute('');

    await expect(promise).rejects.toThrow(DomainException);
    await promise.catch((error: DomainException) => {
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
      expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
    });
    expect(tenantRepo.findById).not.toHaveBeenCalled();
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });
});
