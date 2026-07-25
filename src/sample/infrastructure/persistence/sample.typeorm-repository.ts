import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SampleTypeormEntity } from './sample.typeorm-entity';
import { Sample } from '../../domain/entities/sample.entity';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';

/**
 * Unico ponto do modulo que conhece TypeORM. Duas coisas para copiar daqui:
 *
 * - `tenantId` entra no `where` de **todas** as operacoes, inclusive nas que ja
 *   recebem o `id`: sem ele, um id valido de outro tenant e um vazamento.
 * - `deletedAt IS NULL` nao aparece escrito. O `@DeleteDateColumn` faz o TypeORM
 *   adicionar o filtro sozinho em `find*`; quem sai desse caminho (o
 *   `createQueryBuilder` de `getMaxSortOrder`) precisa filtrar na mao.
 */
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
      sortOrder: sample.sortOrder,
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
      // `id` como ultimo criterio de desempate: sem ele, registros com o mesmo
      // sortOrder e o mesmo createdAt podem trocar de pagina entre requisicoes.
      order: { sortOrder: 'ASC', createdAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return [entities.map((e) => this.toDomain(e)), total];
  }

  async getMaxSortOrder(tenantId: string): Promise<number> {
    // Agregado calculado no banco: carregar a lista para achar o maior valor
    // custaria uma leitura proporcional ao tamanho do tenant.
    const result = await this.repo
      .createQueryBuilder('sample')
      .select('MAX(sample.sortOrder)', 'max')
      .where('sample.tenantId = :tenantId', { tenantId })
      // O queryBuilder nao herda o filtro de soft delete do @DeleteDateColumn.
      .andWhere('sample.deletedAt IS NULL')
      .getRawOne<{ max: number | null }>();
    return result?.max ?? -1;
  }

  async update(sample: Sample): Promise<Sample> {
    await this.repo.update(
      { id: sample.id, tenantId: sample.tenantId },
      {
        name: sample.name,
        description: sample.description,
        isActive: sample.isActive,
        sortOrder: sample.sortOrder,
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
      sortOrder: entity.sortOrder,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
