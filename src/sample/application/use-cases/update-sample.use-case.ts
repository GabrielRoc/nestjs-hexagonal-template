import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { UpdateSampleDto, SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

/**
 * Update parcial: cada campo e copiado so quando vem no DTO. O teste da
 * diferenca entre `undefined` (campo ausente, mantem) e `null` (cliente pediu
 * para limpar) — `if (dto.description)` apagaria a diferenca e ignoraria `null`
 * e string vazia.
 */
@Injectable()
export class UpdateSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(
    id: string,
    tenantId: string,
    dto: UpdateSampleDto,
  ): Promise<SampleResponseDto> {
    // `findById` recebe o tenant: um id de outro tenant tem de dar 404, nunca
    // 403 nem o registro do vizinho.
    const sample = await this.sampleRepo.findById(id, tenantId);
    if (!sample) {
      throw new DomainException(
        ErrorCode.SAMPLE_NOT_FOUND,
        'Sample não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.name !== undefined) sample.name = dto.name;
    if (dto.description !== undefined) sample.description = dto.description;
    if (dto.isActive !== undefined) sample.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) sample.sortOrder = dto.sortOrder;

    const updated = await this.sampleRepo.update(sample);
    return SampleMapper.toResponse(updated);
  }
}
