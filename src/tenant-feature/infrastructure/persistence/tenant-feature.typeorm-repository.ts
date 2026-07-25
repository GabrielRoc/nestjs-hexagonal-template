import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureRepositoryPort } from '../../domain/ports/tenant-feature.repository.port';
import { TenantFeatureTypeormEntity } from './tenant-feature.typeorm-entity';

/**
 * Predicado do indice unico parcial de `tenant_features`. O Postgres exige que
 * o `ON CONFLICT` repita o predicado do indice parcial, senao responde
 * "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification". TypeORM emite isso via `indexPredicate`.
 */
const SOFT_DELETE_INDEX_PREDICATE = '"deletedAt" IS NULL';

@Injectable()
export class TenantFeatureTypeormRepository implements TenantFeatureRepositoryPort {
  constructor(
    @InjectRepository(TenantFeatureTypeormEntity)
    private readonly repo: Repository<TenantFeatureTypeormEntity>,
  ) {}

  async findByTenantId(tenantId: string): Promise<TenantFeature[]> {
    const entities = await this.repo.find({
      where: { tenantId },
      order: { featureKey: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async bulkUpsert(
    tenantId: string,
    features: TenantFeature[],
  ): Promise<TenantFeature[]> {
    if (features.length === 0) {
      return [];
    }

    // tenantId vem do parametro, nunca das entidades: um chamador que montasse
    // a lista com tenantId de outro tenant nao consegue escrever fora do seu
    // escopo, e a releitura abaixo fica coerente com o que foi escrito.
    const rows = features.map((f) => ({
      tenantId,
      featureKey: f.featureKey,
      enabled: f.enabled,
      numericValue: f.numericValue,
    }));

    await this.repo.upsert(rows, {
      conflictPaths: ['tenantId', 'featureKey'],
      indexPredicate: SOFT_DELETE_INDEX_PREDICATE,
    });

    const saved = await this.repo.find({
      where: { tenantId, featureKey: In(rows.map((r) => r.featureKey)) },
      order: { featureKey: 'ASC' },
    });

    return saved.map((e) => this.toDomain(e));
  }

  private toDomain(entity: TenantFeatureTypeormEntity): TenantFeature {
    return new TenantFeature({
      id: entity.id,
      tenantId: entity.tenantId,
      featureKey: entity.featureKey,
      enabled: entity.enabled,
      numericValue: entity.numericValue,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
