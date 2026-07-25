import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTypeormEntity } from './user.typeorm-entity';
import { User } from '../../domain/entities/user.entity';
import { Role } from '../../../common/enums/role.enum';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';

@Injectable()
export class UserTypeormRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserTypeormEntity)
    private readonly repo: Repository<UserTypeormEntity>,
  ) {}

  async save(user: User): Promise<User> {
    const entity = this.repo.create({
      tenantId: user.tenantId,
      supertokensUserId: user.supertokensUserId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findById(id: string, tenantId: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(tenantId: string): Promise<User[]> {
    const entities = await this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async update(user: User): Promise<User> {
    // O criterio inclui tenantId: sem ele um id vazado de outro tenant seria
    // atualizado mesmo tendo passado por um findById corretamente escopado.
    await this.repo.update(
      { id: user.id, tenantId: user.tenantId },
      {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    );
    const updated = await this.repo.findOneOrFail({
      where: { id: user.id, tenantId: user.tenantId },
    });
    return this.toDomain(updated);
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.repo.softDelete({ id, tenantId });
  }

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { email, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findActiveBySupertokensUserId(
    supertokensUserId: string,
  ): Promise<User | null> {
    const entity = await this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .where('user.supertokensUserId = :supertokensUserId', {
        supertokensUserId,
      })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .andWhere('tenant.isActive = true')
      .andWhere('tenant.deletedAt IS NULL')
      .getOne();
    return entity ? this.toDomain(entity) : null;
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.repo.count({ where: { tenantId } });
  }

  async countActiveAdminsByTenantId(tenantId: string): Promise<number> {
    return this.repo.count({
      where: { tenantId, role: Role.ADMIN, isActive: true },
    });
  }

  private toDomain(entity: UserTypeormEntity): User {
    return new User({
      id: entity.id,
      tenantId: entity.tenantId,
      supertokensUserId: entity.supertokensUserId,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      role: entity.role as Role,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
