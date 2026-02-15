import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class DeleteSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const sample = await this.sampleRepo.findById(id, tenantId);
    if (!sample) {
      throw new DomainException(
        ErrorCode.SAMPLE_NOT_FOUND,
        'Sample não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.sampleRepo.softDelete(id, tenantId);
  }
}
