import { Injectable } from '@nestjs/common';
import type { TenantFeatureResponseDto } from '../dtos/tenant-feature.dto';
import { TenantFeatureService } from '../services/tenant-feature.service';

@Injectable()
export class GetTenantFeaturesUseCase {
  constructor(private readonly tenantFeatureService: TenantFeatureService) {}

  async execute(tenantId: string): Promise<TenantFeatureResponseDto[]> {
    return this.tenantFeatureService.getAllFeatures(tenantId);
  }
}
