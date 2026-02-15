import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type TenantRepositoryPort,
} from '../../domain/ports/tenant.repository.port';
import type { CreateTenantDto, TenantResponseDto } from '../dtos/tenant.dto';
import { TenantMapper } from '../mappers/tenant.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class CreateTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: TenantRepositoryPort,
  ) {}

  async execute(dto: CreateTenantDto): Promise<TenantResponseDto> {
    const existing = await this.tenantRepo.findByDocument(dto.document);
    if (existing) {
      throw new DomainException(
        ErrorCode.TENANT_DOCUMENT_ALREADY_EXISTS,
        'CNPJ já cadastrado',
        HttpStatus.CONFLICT,
      );
    }

    const tenant = TenantMapper.toDomain(dto);
    const saved = await this.tenantRepo.save(tenant);
    return TenantMapper.toResponse(saved);
  }
}
