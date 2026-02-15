import { User } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  save(user: User): Promise<User>;
  findById(id: string, tenantId: string): Promise<User | null>;
  findAll(tenantId: string): Promise<User[]>;
  update(user: User): Promise<User>;
  softDelete(id: string, tenantId: string): Promise<void>;
  findByEmail(email: string, tenantId: string): Promise<User | null>;
  findActiveBySupertokensUserId(
    supertokensUserId: string,
  ): Promise<User | null>;
  countByTenantId(tenantId: string): Promise<number>;
  countActiveAdminsByTenantId(tenantId: string): Promise<number>;
}
