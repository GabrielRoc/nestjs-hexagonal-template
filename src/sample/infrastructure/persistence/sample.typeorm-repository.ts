import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SampleTypeormEntity } from './sample.typeorm-entity';
import { Sample } from '../../domain/entities/sample.entity';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';

@Injectable()
export class SampleTypeormRepository implements SampleRepositoryPort {
  constructor(
    @InjectRepository(SampleTypeormEntity)
    private readonly repo: Repository<SampleTypeormEntity>,
  ) {}

  async save(sample: Sample): Promise<Sample> {
    const entity = this.repo.create({
      tenantId: sample.tenantId,
      name: sample.name,
      description: sample.description,
      isActive: sample.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findById(id: string, tenantId: string): Promise<Sample | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(
    tenantId: string,
    page: number,
    perPage: number,
  ): Promise<[Sample[], number]> {
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return [entities.map((e) => this.toDomain(e)), total];
  }

  async update(sample: Sample): Promise<Sample> {
    await this.repo.update(
      { id: sample.id, tenantId: sample.tenantId },
      {
        name: sample.name,
        description: sample.description,
        isActive: sample.isActive,
      },
    );
    const updated = await this.repo.findOneOrFail({
      where: { id: sample.id, tenantId: sample.tenantId },
    });
    return this.toDomain(updated);
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.repo.softDelete({ id, tenantId });
  }

  private toDomain(entity: SampleTypeormEntity): Sample {
    return new Sample({
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
