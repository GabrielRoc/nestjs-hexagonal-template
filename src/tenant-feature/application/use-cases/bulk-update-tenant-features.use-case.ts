import { Inject, Injectable } from '@nestjs/common';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import {
  TENANT_FEATURE_REPOSITORY,
  type TenantFeatureRepositoryPort,
} from '../../domain/ports/tenant-feature.repository.port';
import type {
  BulkUpdateTenantFeaturesDto,
  TenantFeatureResponseDto,
} from '../dtos/tenant-feature.dto';
import { TenantFeatureMapper } from '../mappers/tenant-feature.mapper';
import { TenantFeatureService } from '../services/tenant-feature.service';

@Injectable()
export class BulkUpdateTenantFeaturesUseCase {
  constructor(
    @Inject(TENANT_FEATURE_REPOSITORY)
    private readonly repo: TenantFeatureRepositoryPort,
    private readonly tenantFeatureService: TenantFeatureService,
  ) {}

  async execute(
    tenantId: string,
    dto: BulkUpdateTenantFeaturesDto,
  ): Promise<TenantFeatureResponseDto[]> {
    const features = dto.features.map(
      (f) =>
        new TenantFeature({
          tenantId,
          featureKey: f.featureKey,
          enabled: f.enabled,
          numericValue: f.numericValue ?? null,
        }),
    );

    const updated = await this.repo.bulkUpsert(tenantId, features);

    // Depois da escrita, nunca antes: se invalidasse antes, uma leitura
    // concorrente repovoaria o cache com o valor antigo e a flag nova ficaria
    // presa ate o TTL vencer.
    this.tenantFeatureService.invalidateCache(tenantId);

    return updated.map((f) => TenantFeatureMapper.toResponse(f));
  }
}
