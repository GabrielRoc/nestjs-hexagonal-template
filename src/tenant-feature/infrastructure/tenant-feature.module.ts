import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTypeormEntity } from '../../tenant/infrastructure/persistence/tenant.typeorm-entity';
import { TenantFeatureService } from '../application/services/tenant-feature.service';
import { BulkUpdateTenantFeaturesUseCase } from '../application/use-cases/bulk-update-tenant-features.use-case';
import { GetTenantFeaturesUseCase } from '../application/use-cases/get-tenant-features.use-case';
import { TENANT_FEATURE_CACHE } from '../domain/ports/tenant-feature-cache.port';
import { TENANT_FEATURE_REPOSITORY } from '../domain/ports/tenant-feature.repository.port';
import { InMemoryTenantFeatureCache } from './cache/in-memory-tenant-feature.cache';
import { TenantFeatureController } from './http/tenant-feature.controller';
import { TenantFeatureTypeormEntity } from './persistence/tenant-feature.typeorm-entity';
import { TenantFeatureTypeormRepository } from './persistence/tenant-feature.typeorm-repository';

/**
 * Nao e @Global() (a fonte era). O AppModule importa este modulo, o que basta
 * para o FeatureGuard registrado la resolver TenantFeatureService; quem mais
 * precisar do servico importa TenantFeatureModule explicitamente.
 *
 * Para trocar o cache in-memory por Redis, rebind TENANT_FEATURE_CACHE aqui:
 * nem servico, nem use case, nem guard mudam.
 */
@Module({
  // TenantTypeormEntity entra no forFeature por causa do @ManyToOne da entidade:
  // com autoLoadEntities, o TypeORM so conhece o que algum forFeature registrou,
  // e sem ela o boot morre em "Entity metadata for
  // TenantFeatureTypeormEntity#tenant was not found". Registrar aqui deixa o
  // modulo carregavel sozinho (util em teste) em vez de depender de o AppModule
  // tambem importar o TenantModule.
  imports: [
    TypeOrmModule.forFeature([TenantFeatureTypeormEntity, TenantTypeormEntity]),
  ],
  controllers: [TenantFeatureController],
  providers: [
    {
      provide: TENANT_FEATURE_REPOSITORY,
      useClass: TenantFeatureTypeormRepository,
    },
    {
      provide: TENANT_FEATURE_CACHE,
      useClass: InMemoryTenantFeatureCache,
    },
    TenantFeatureService,
    GetTenantFeaturesUseCase,
    BulkUpdateTenantFeaturesUseCase,
  ],
  exports: [TenantFeatureService],
})
export class TenantFeatureModule {}
