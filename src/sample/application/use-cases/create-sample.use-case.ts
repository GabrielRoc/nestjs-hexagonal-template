import { Inject, Injectable } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';

/**
 * Um use case, um metodo `execute`. Ele depende do Symbol do port — nunca da
 * classe TypeORM — e por isso o teste unitario roda com um objeto de mentira no
 * lugar do repositorio, sem banco.
 */
@Injectable()
export class CreateSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(
    dto: CreateSampleDto,
    tenantId: string,
  ): Promise<SampleResponseDto> {
    // `sortOrder` explicito manda; ausente, o registro entra no fim da lista do
    // tenant. `getMaxSortOrder` devolve -1 no tenant vazio, logo o primeiro
    // sample fica com 0 sem caso especial aqui.
    const sortOrder =
      dto.sortOrder ?? (await this.sampleRepo.getMaxSortOrder(tenantId)) + 1;

    const sample = SampleMapper.toDomain(dto, tenantId, sortOrder);
    const saved = await this.sampleRepo.save(sample);
    return SampleMapper.toResponse(saved);
  }
}
