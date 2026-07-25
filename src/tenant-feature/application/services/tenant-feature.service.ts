import { Inject, Injectable } from '@nestjs/common';
import type { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { FeatureKeyValue } from '../../domain/enums/feature-key.enum';
import { FeatureKey } from '../../domain/enums/feature-key.enum';
import {
  TENANT_FEATURE_CACHE,
  type TenantFeatureCachePort,
} from '../../domain/ports/tenant-feature-cache.port';
import {
  TENANT_FEATURE_REPOSITORY,
  type TenantFeatureRepositoryPort,
} from '../../domain/ports/tenant-feature.repository.port';
import type { TenantFeatureResponseDto } from '../dtos/tenant-feature.dto';
import { assertTenantContext } from '../tenant.assertions';

/**
 * Leitura das feature flags de um tenant, com cache.
 *
 * Politica de default: chave SEM linha no banco conta como HABILITADA. O modelo
 * e opt-out — declarar uma chave nova em FeatureKey nao derruba os tenants
 * existentes; desligar exige uma linha explicita com `enabled = false`. A
 * consequencia a conhecer e que `@RequiresFeature()` em uma instalacao sem
 * nenhuma linha persistida nao bloqueia nada.
 */
@Injectable()
export class TenantFeatureService {
  constructor(
    @Inject(TENANT_FEATURE_REPOSITORY)
    private readonly repo: TenantFeatureRepositoryPort,
    @Inject(TENANT_FEATURE_CACHE)
    private readonly cache: TenantFeatureCachePort,
  ) {}

  async isFeatureEnabled(
    tenantId: string,
    featureKey: FeatureKeyValue,
  ): Promise<boolean> {
    const feature = await this.findFeature(tenantId, featureKey);
    return feature ? feature.enabled : true;
  }

  async getNumericLimit(
    tenantId: string,
    featureKey: FeatureKeyValue,
  ): Promise<number | null> {
    const feature = await this.findFeature(tenantId, featureKey);
    return feature?.numericValue ?? null;
  }

  /**
   * Todas as chaves declaradas em FeatureKey com o estado efetivo do tenant,
   * mais as chaves persistidas que nao estao (mais) declaradas — senao uma flag
   * gravada antes de a chave ser removida do enum ficaria invisivel na API.
   */
  async getAllFeatures(tenantId: string): Promise<TenantFeatureResponseDto[]> {
    const features = await this.loadFeatures(tenantId);
    const featureMap = new Map(features.map((f) => [f.featureKey, f]));
    const keys = new Set<FeatureKeyValue>([
      ...Object.values(FeatureKey),
      ...featureMap.keys(),
    ]);

    // Ordem estavel: a resposta nao deve depender da ordem de insercao no Set.
    return [...keys].sort().map((key) => {
      const existing = featureMap.get(key);
      return {
        featureKey: key,
        enabled: existing ? existing.enabled : true,
        numericValue: existing?.numericValue ?? null,
      };
    });
  }

  /** Derruba o cache do tenant. Obrigatorio depois de qualquer escrita. */
  invalidateCache(tenantId: string): void {
    this.cache.invalidate(tenantId);
  }

  private async findFeature(
    tenantId: string,
    featureKey: FeatureKeyValue,
  ): Promise<TenantFeature | undefined> {
    const features = await this.loadFeatures(tenantId);
    return features.find((f) => f.featureKey === featureKey);
  }

  private async loadFeatures(tenantId: string): Promise<TenantFeature[]> {
    // tenantId vazio nao e um filtro: a query iria ao banco com '' e o Postgres
    // devolveria erro de cast de uuid (500). 403 com codigo e a resposta
    // correta; 500 seria ruido. Vale para o caminho do FeatureGuard, que chama
    // o servico direto, sem passar por use case.
    assertTenantContext(tenantId);

    const cached = this.cache.get(tenantId);
    if (cached !== null) {
      return cached;
    }

    const features = await this.repo.findByTenantId(tenantId);
    this.cache.set(tenantId, features);
    return features;
  }
}
