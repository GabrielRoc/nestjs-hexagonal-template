import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { Tenant } from '../../../tenant/domain/entities/tenant.entity';
import type { TenantRepositoryPort } from '../../../tenant/domain/ports/tenant.repository.port';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureCachePort } from '../../domain/ports/tenant-feature-cache.port';
import type { TenantFeatureRepositoryPort } from '../../domain/ports/tenant-feature.repository.port';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { BulkUpdateTenantFeaturesUseCase } from './bulk-update-tenant-features.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function noopCache(): TenantFeatureCachePort {
  return {
    get: () => null,
    set: () => undefined,
    invalidate: () => undefined,
  };
}

function tenant(): Tenant {
  return new Tenant({
    id: TENANT_ID,
    name: 'Tenant',
    document: '00000000000',
    email: 'tenant@example.com',
    phone: '11999999999',
  });
}

describe('BulkUpdateTenantFeaturesUseCase', () => {
  let repo: jest.Mocked<
    Pick<TenantFeatureRepositoryPort, 'findByTenantId' | 'bulkUpsert'>
  >;
  let tenantRepo: jest.Mocked<Pick<TenantRepositoryPort, 'findById'>>;
  let cache: TenantFeatureCachePort;
  let useCase: BulkUpdateTenantFeaturesUseCase;

  beforeEach(() => {
    repo = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      // A resposta vem da releitura do repositorio; os testes de merge assertam
      // o que foi ENVIADO ao bulkUpsert.
      bulkUpsert: jest.fn().mockResolvedValue([]),
    };
    tenantRepo = { findById: jest.fn().mockResolvedValue(tenant()) };
    cache = noopCache();
    useCase = new BulkUpdateTenantFeaturesUseCase(
      repo,
      new TenantFeatureService(repo, cache),
      tenantRepo as unknown as TenantRepositoryPort,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('numericValue', () => {
    it('preserva o limite guardado quando o campo e omitido', async () => {
      // Regressao: `numericValue ?? null` apagava o limite em silencio, com 200
      // OK, sempre que o cliente mandava so `enabled` — o que o Swagger
      // documenta como "nao mexe".
      repo.findByTenantId.mockResolvedValue([
        new TenantFeature({
          tenantId: TENANT_ID,
          featureKey: 'MAX_ITEMS',
          enabled: true,
          numericValue: 100,
        }),
      ]);

      await useCase.execute(TENANT_ID, {
        features: [{ featureKey: 'MAX_ITEMS', enabled: true }],
      });

      expect(repo.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, [
        expect.objectContaining({ featureKey: 'MAX_ITEMS', numericValue: 100 }),
      ]);
    });

    it('preserva o limite de uma feature mesmo quando outra do lote define o seu', async () => {
      // O TypeORM decide as colunas do DO UPDATE olhando o lote inteiro, entao
      // depender do `undefined` na row apagaria o limite desta justamente
      // quando a outra informa um numero.
      repo.findByTenantId.mockResolvedValue([
        new TenantFeature({
          tenantId: TENANT_ID,
          featureKey: 'MAX_ITEMS',
          enabled: true,
          numericValue: 100,
        }),
      ]);

      await useCase.execute(TENANT_ID, {
        features: [
          { featureKey: 'MAX_ITEMS', enabled: true },
          { featureKey: 'MAX_USERS', enabled: true, numericValue: 7 },
        ],
      });

      expect(repo.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, [
        expect.objectContaining({ featureKey: 'MAX_ITEMS', numericValue: 100 }),
        expect.objectContaining({ featureKey: 'MAX_USERS', numericValue: 7 }),
      ]);
    });

    it('limpa o limite quando o campo vem null explicitamente', async () => {
      repo.findByTenantId.mockResolvedValue([
        new TenantFeature({
          tenantId: TENANT_ID,
          featureKey: 'MAX_ITEMS',
          enabled: true,
          numericValue: 100,
        }),
      ]);

      await useCase.execute(TENANT_ID, {
        features: [
          { featureKey: 'MAX_ITEMS', enabled: true, numericValue: null },
        ],
      });

      expect(repo.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, [
        expect.objectContaining({
          featureKey: 'MAX_ITEMS',
          numericValue: null,
        }),
      ]);
    });

    it('aceita 0 como limite, sem confundir com ausencia de limite', async () => {
      await useCase.execute(TENANT_ID, {
        features: [{ featureKey: 'MAX_ITEMS', enabled: true, numericValue: 0 }],
      });

      expect(repo.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, [
        expect.objectContaining({ featureKey: 'MAX_ITEMS', numericValue: 0 }),
      ]);
    });

    it('escreve null quando a feature e nova e o campo e omitido', async () => {
      await useCase.execute(TENANT_ID, {
        features: [{ featureKey: 'NOVA', enabled: false }],
      });

      expect(repo.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, [
        expect.objectContaining({ featureKey: 'NOVA', numericValue: null }),
      ]);
    });
  });

  describe('tenant', () => {
    it('recusa tenant inexistente com TENANT_NOT_FOUND e 404, sem escrever', async () => {
      // Antes disto, o unico obstaculo era a FK: 23503 do Postgres virava 500
      // INTERNAL_ERROR, escondendo um erro do chamador.
      tenantRepo.findById.mockResolvedValue(null);

      const promise = useCase.execute(TENANT_ID, {
        features: [{ featureKey: 'EXPORT', enabled: false }],
      });

      await expect(promise).rejects.toThrow(DomainException);
      await promise.catch((error: DomainException) => {
        expect(error.code).toBe(ErrorCode.TENANT_NOT_FOUND);
        expect(error.httpStatus).toBe(HttpStatus.NOT_FOUND);
      });
      expect(repo.bulkUpsert).not.toHaveBeenCalled();
    });

    it('nega tenantId vazio sem consultar o repositorio de tenants', async () => {
      const promise = useCase.execute('', {
        features: [{ featureKey: 'EXPORT', enabled: false }],
      });

      await expect(promise).rejects.toThrow(DomainException);
      await promise.catch((error: DomainException) => {
        expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
        expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
      });
      // Com '' o findById iria ao Postgres e voltaria 22P02 (500).
      expect(tenantRepo.findById).not.toHaveBeenCalled();
      expect(repo.bulkUpsert).not.toHaveBeenCalled();
    });
  });

  it('invalida o cache do tenant depois da escrita', async () => {
    const invalidate = jest.spyOn(cache, 'invalidate');

    await useCase.execute(TENANT_ID, {
      features: [{ featureKey: 'EXPORT', enabled: false }],
    });

    expect(invalidate).toHaveBeenCalledWith(TENANT_ID);
    expect(invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
      repo.bulkUpsert.mock.invocationCallOrder[0],
    );
  });
});
