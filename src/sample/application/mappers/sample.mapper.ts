import { Sample } from '../../domain/entities/sample.entity';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';

export class SampleMapper {
  static toResponse(entity: Sample): SampleResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  static toDomain(dto: CreateSampleDto, tenantId: string): Sample {
    return new Sample({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
    });
  }
}
