import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantTypeormEntity } from './tenant.typeorm-entity';
import { Tenant } from '../../domain/entities/tenant.entity';
import type { TenantRepositoryPort } from '../../domain/ports/tenant.repository.port';

@Injectable()
export class TenantTypeormRepository implements TenantRepositoryPort {
  constructor(
    @InjectRepository(TenantTypeormEntity)
    private readonly repo: Repository<TenantTypeormEntity>,
  ) {}

  async save(tenant: Tenant): Promise<Tenant> {
    const entity = this.repo.create({
      name: tenant.name,
      document: tenant.document,
      email: tenant.email,
      phone: tenant.phone,
      isActive: tenant.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(): Promise<Tenant[]> {
    const entities = await this.repo.find({ order: { createdAt: 'DESC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async update(tenant: Tenant): Promise<Tenant> {
    await this.repo.update(tenant.id, {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      isActive: tenant.isActive,
    });
    const updated = await this.repo.findOneOrFail({ where: { id: tenant.id } });
    return this.toDomain(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findByDocument(document: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { document } });
    return entity ? this.toDomain(entity) : null;
  }

  private toDomain(entity: TenantTypeormEntity): Tenant {
    return new Tenant({
      id: entity.id,
      name: entity.name,
      document: entity.document,
      email: entity.email,
      phone: entity.phone,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
