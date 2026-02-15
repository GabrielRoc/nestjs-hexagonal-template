import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTypeormEntity } from './persistence/tenant.typeorm-entity';
import { TenantTypeormRepository } from './persistence/tenant.typeorm-repository';
import { TENANT_REPOSITORY } from '../domain/ports/tenant.repository.port';
import { TenantController } from './http/tenant.controller';
import { CreateTenantUseCase } from '../application/use-cases/create-tenant.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([TenantTypeormEntity])],
  controllers: [TenantController],
  providers: [
    {
      provide: TENANT_REPOSITORY,
      useClass: TenantTypeormRepository,
    },
    CreateTenantUseCase,
  ],
  exports: [TENANT_REPOSITORY],
})
export class TenantModule {}
