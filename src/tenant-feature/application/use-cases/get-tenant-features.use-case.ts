import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type TenantRepositoryPort,
} from '../../../tenant/domain/ports/tenant.repository.port';
import type { TenantFeatureResponseDto } from '../dtos/tenant-feature.dto';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { assertTenantContext, assertTenantExists } from '../tenant.assertions';

@Injectable()
export class GetTenantFeaturesUseCase {
  constructor(
    private readonly tenantFeatureService: TenantFeatureService,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: TenantRepositoryPort,
  ) {}

  async execute(tenantId: string): Promise<TenantFeatureResponseDto[]> {
    // Contexto antes de existencia: com tenantId vazio o findById iria ao banco
    // com '' e viraria 500. Ordem justificada em tenant.assertions.ts.
    assertTenantContext(tenantId);
    // A resposta lista as chaves declaradas mesmo sem linha persistida, entao
    // sem esta checagem um uuid inexistente devolveria 200 afirmando o estado
    // das flags de um tenant que nao existe (e ocupando entrada no cache).
    await assertTenantExists(this.tenantRepository, tenantId);

    return this.tenantFeatureService.getAllFeatures(tenantId);
  }
}
