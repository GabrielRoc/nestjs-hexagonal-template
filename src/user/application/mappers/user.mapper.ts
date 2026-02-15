import { User } from '../../domain/entities/user.entity';
import type { UserResponseDto } from '../dtos/user.dto';

export class UserMapper {
  static toResponse(entity: User): UserResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      role: entity.role,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
