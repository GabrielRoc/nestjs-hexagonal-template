import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type TenantRepositoryPort,
} from '../../../tenant/domain/ports/tenant.repository.port';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import type { FeatureKeyValue } from '../../domain/enums/feature-key.enum';
import {
  TENANT_FEATURE_REPOSITORY,
  type TenantFeatureRepositoryPort,
} from '../../domain/ports/tenant-feature.repository.port';
import type {
  BulkUpdateTenantFeaturesDto,
  TenantFeatureResponseDto,
  UpdateTenantFeatureDto,
} from '../dtos/tenant-feature.dto';
import { TenantFeatureMapper } from '../mappers/tenant-feature.mapper';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { assertTenantContext, assertTenantExists } from '../tenant.assertions';

@Injectable()
export class BulkUpdateTenantFeaturesUseCase {
  constructor(
    @Inject(TENANT_FEATURE_REPOSITORY)
    private readonly repo: TenantFeatureRepositoryPort,
    private readonly tenantFeatureService: TenantFeatureService,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: TenantRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    dto: BulkUpdateTenantFeaturesDto,
  ): Promise<TenantFeatureResponseDto[]> {
    assertTenantContext(tenantId);
    // Sem isto o unico obstaculo a um uuid inexistente era a FK do banco, cujo
    // QueryFailedError (23503) o GlobalExceptionFilter entrega como 500
    // INTERNAL_ERROR — erro do chamador reportado como falha do servidor.
    await assertTenantExists(this.tenantRepository, tenantId);

    // `numericValue` ausente significa "nao mexe": para preservar o valor
    // guardado e preciso le-lo antes da escrita. Nao se pode delegar isso ao
    // ON CONFLICT deixando a chave `undefined` na row — o TypeORM decide as
    // colunas do DO UPDATE olhando o LOTE inteiro (`overwriteColumns` inclui a
    // coluna se QUALQUER entidade do lote a define), logo uma feature que omite
    // o campo seria sobrescrita com DEFAULT/NULL sempre que outra do mesmo PUT
    // informasse um numero.
    const current = await this.repo.findByTenantId(tenantId);
    const currentByKey = new Map<FeatureKeyValue, TenantFeature>(
      current.map((f) => [f.featureKey, f]),
    );

    const features = dto.features.map(
      (f) =>
        new TenantFeature({
          tenantId,
          featureKey: f.featureKey,
          enabled: f.enabled,
          numericValue: resolveNumericValue(f, currentByKey.get(f.featureKey)),
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

/**
 * Os tres estados de `numericValue` no PUT (ver updateTenantFeatureSchema):
 * ausente mantem o que esta no banco, `null` limpa, numero define.
 *
 * `undefined` cobre os dois jeitos de o campo chegar ausente — chave omitida
 * pelo cliente e chave presente com valor `undefined` apos o parse do Zod.
 */
function resolveNumericValue(
  dto: UpdateTenantFeatureDto,
  current: TenantFeature | undefined,
): number | null {
  if (dto.numericValue !== undefined) {
    return dto.numericValue;
  }
  return current?.numericValue ?? null;
}
