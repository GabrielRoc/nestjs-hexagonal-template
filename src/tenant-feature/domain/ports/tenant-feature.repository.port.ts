import type { TenantFeature } from '../entities/tenant-feature.entity';

export const TENANT_FEATURE_REPOSITORY = Symbol('TENANT_FEATURE_REPOSITORY');

export interface TenantFeatureRepositoryPort {
  /**
   * Todas as flags persistidas do tenant. E a unica leitura usada no caminho
   * quente: o cache guarda a lista inteira por tenant, entao uma consulta serve
   * qualquer quantidade de checagens de feature.
   */
  findByTenantId(tenantId: string): Promise<TenantFeature[]>;

  bulkUpsert(
    tenantId: string,
    features: TenantFeature[],
  ): Promise<TenantFeature[]>;
}
