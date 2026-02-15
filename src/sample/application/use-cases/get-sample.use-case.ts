import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class GetSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(id: string, tenantId: string): Promise<SampleResponseDto> {
    const sample = await this.sampleRepo.findById(id, tenantId);
    if (!sample) {
      throw new DomainException(
        ErrorCode.SAMPLE_NOT_FOUND,
        'Sample não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return SampleMapper.toResponse(sample);
  }
}
