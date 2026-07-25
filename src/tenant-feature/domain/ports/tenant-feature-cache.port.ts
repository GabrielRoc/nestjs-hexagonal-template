import type { TenantFeature } from '../entities/tenant-feature.entity';

export const TENANT_FEATURE_CACHE = Symbol('TENANT_FEATURE_CACHE');

/**
 * Cache das flags de um tenant. Existe porque o FeatureGuard e um APP_GUARD:
 * sem cache, toda requisicao de rota marcada com @RequiresFeature() pagaria uma
 * consulta extra ao banco.
 *
 * A granularidade e o tenant inteiro (nao a chave individual) por dois motivos:
 * uma leitura serve N checagens de feature na mesma requisicao, e a invalidacao
 * do bulk update e naturalmente por tenant.
 *
 * O adapter padrao e in-memory (por processo). Trocar por Redis quando houver
 * um e so rebind deste token no TenantFeatureModule — nada mais muda.
 */
export interface TenantFeatureCachePort {
  /** `null` = miss (ou expirado). Uma lista vazia e um hit valido. */
  get(tenantId: string): TenantFeature[] | null;

  set(tenantId: string, features: TenantFeature[]): void;

  /** Chamado apos escrita. Deve ser idempotente. */
  invalidate(tenantId: string): void;
}
