import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureCachePort } from '../../domain/ports/tenant-feature-cache.port';

export const DEFAULT_CACHE_TTL_MS = 30_000;
export const DEFAULT_CACHE_MAX_TENANTS = 1_000;

interface CacheEntry {
  features: TenantFeature[];
  expiresAt: number;
}

/**
 * Cache in-memory, POR PROCESSO, com TTL curto e limitado.
 *
 * LIMITE QUE PRECISA SER CONHECIDO ANTES DE IR PARA PRODUCAO COM VARIAS
 * INSTANCIAS: `invalidate()` so derruba o cache DESTE processo. Se a instancia A
 * atende o `PUT /admin/tenants/:id/features` que desliga uma flag, as instancias
 * B, C... continuam servindo o valor antigo — ou seja, uma feature ja desligada
 * continua liberada — ate a entrada expirar pelo TTL. Nao existe invalidacao
 * cross-instance aqui; o que existe e uma janela de inconsistencia LIMITADA pelo
 * TTL (padrao 30s). O TTL curto e a garantia, nao a invalidacao.
 *
 * A escolha e deliberada para um template: nao ha Redis nas dependencias e o
 * caminho de saida esta pronto — o TenantFeatureModule faz bind do token
 * TENANT_FEATURE_CACHE, entao um adapter Redis (com pub/sub para invalidacao
 * real cross-instance) substitui este sem tocar em servico, use case ou guard.
 *
 * Se a janela de 30s for inaceitavel para alguma flag (por exemplo, corte de
 * acesso por inadimplencia), baixe TENANT_FEATURE_CACHE_TTL_MS ou defina 0 para
 * desligar o cache e voltar a consultar o banco a cada checagem.
 */
@Injectable()
export class InMemoryTenantFeatureCache implements TenantFeatureCachePort {
  private readonly logger = new Logger(InMemoryTenantFeatureCache.name);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxTenants: number;

  constructor(configService: ConfigService) {
    this.ttlMs = readNonNegativeInt(
      configService.get<string>('TENANT_FEATURE_CACHE_TTL_MS'),
      DEFAULT_CACHE_TTL_MS,
    );
    this.maxTenants = readPositiveInt(
      configService.get<string>('TENANT_FEATURE_CACHE_MAX_TENANTS'),
      DEFAULT_CACHE_MAX_TENANTS,
    );

    if (this.ttlMs === 0) {
      this.logger.warn(
        'TENANT_FEATURE_CACHE_TTL_MS=0: cache de feature flags desligado, cada checagem consulta o banco',
      );
    }
  }

  get(tenantId: string): TenantFeature[] | null {
    const entry = this.entries.get(tenantId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(tenantId);
      return null;
    }
    // Copia: quem le nao deve conseguir mutar a lista guardada.
    return [...entry.features];
  }

  set(tenantId: string, features: TenantFeature[]): void {
    if (this.ttlMs === 0) {
      return;
    }

    this.prune();
    // Map preserva ordem de insercao: se ainda estourou o limite depois de
    // remover os expirados, sai a entrada mais antiga. Sem isso, um sistema com
    // muitos tenants faria o Map crescer sem teto.
    while (this.entries.size >= this.maxTenants) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }

    this.entries.set(tenantId, {
      features: [...features],
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(tenantId: string): void {
    this.entries.delete(tenantId);
  }

  private prune(): void {
    const now = Date.now();
    for (const [tenantId, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(tenantId);
      }
    }
  }
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
