import { Inject, Injectable } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';

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
    const sample = SampleMapper.toDomain(dto, tenantId);
    const saved = await this.sampleRepo.save(sample);
    return SampleMapper.toResponse(saved);
  }
}
