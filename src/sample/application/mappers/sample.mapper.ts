import { Sample } from '../../domain/entities/sample.entity';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';

/**
 * Classe estatica, sem estado e sem dependencia: converter entidade <-> DTO nao
 * precisa de DI. `toResponse` e o unico lugar que decide o formato de saida
 * (datas em ISO 8601, nunca `Date` cru) — por isso `deletedAt` nao aparece na
 * resposta.
 */
export class SampleMapper {
  static toResponse(entity: Sample): SampleResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
      sortOrder: entity.sortOrder,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * `sortOrder` chega resolvido pelo use case (que consulta o port para saber o
   * fim da lista): o mapper nao faz I/O nem decide regra de negocio.
   */
  static toDomain(
    dto: CreateSampleDto,
    tenantId: string,
    sortOrder: number,
  ): Sample {
    return new Sample({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      sortOrder,
    });
  }
}
