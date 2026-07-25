import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { TenantFeatureResponseDto } from '../dtos/tenant-feature.dto';

export class TenantFeatureMapper {
  static toResponse(entity: TenantFeature): TenantFeatureResponseDto {
    return {
      featureKey: entity.featureKey,
      enabled: entity.enabled,
      numericValue: entity.numericValue,
    };
  }
}
