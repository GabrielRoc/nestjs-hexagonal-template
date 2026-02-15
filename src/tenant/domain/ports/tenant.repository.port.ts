import { Tenant } from '../entities/tenant.entity';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface TenantRepositoryPort {
  save(tenant: Tenant): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findAll(): Promise<Tenant[]>;
  update(tenant: Tenant): Promise<Tenant>;
  softDelete(id: string): Promise<void>;
  findByDocument(document: string): Promise<Tenant | null>;
}
