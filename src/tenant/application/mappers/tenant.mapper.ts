import { Tenant } from '../../domain/entities/tenant.entity';
import type { CreateTenantDto, TenantResponseDto } from '../dtos/tenant.dto';

export class TenantMapper {
  static toResponse(entity: Tenant): TenantResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      document: entity.document,
      email: entity.email,
      phone: entity.phone,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  static toDomain(dto: CreateTenantDto): Tenant {
    return new Tenant({
      name: dto.name,
      document: dto.document,
      email: dto.email,
      phone: dto.phone,
    });
  }
}
