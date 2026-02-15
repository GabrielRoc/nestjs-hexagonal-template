import { Inject, Injectable } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';
import {
  parsePaginationParams,
  buildPaginationMeta,
} from '../../../common/utils/pagination.util';
import type { PaginatedResponse } from '../../../common/interfaces';

@Injectable()
export class ListSamplesUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    query: { page?: string; perPage?: string },
  ): Promise<PaginatedResponse<SampleResponseDto>> {
    const { page, perPage } = parsePaginationParams(query);
    const [samples, total] = await this.sampleRepo.findAll(
      tenantId,
      page,
      perPage,
    );

    return {
      data: samples.map((s) => SampleMapper.toResponse(s)),
      meta: {
        pagination: buildPaginationMeta(total, page, perPage),
      },
    };
  }
}
