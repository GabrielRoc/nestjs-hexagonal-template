import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { UuidValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createTenantSchema,
  updateTenantSchema,
} from '../../application/dtos/tenant.dto';
import type {
  CreateTenantDto,
  UpdateTenantDto,
} from '../../application/dtos/tenant.dto';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { Inject } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type TenantRepositoryPort,
} from '../../domain/ports/tenant.repository.port';
import { TenantMapper } from '../../application/mappers/tenant.mapper';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@ApiTags('Tenants')
@Controller('v1/tenants')
export class TenantController {
  constructor(
    private readonly createTenantUseCase: CreateTenantUseCase,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: TenantRepositoryPort,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Create a tenant' })
  async create(
    @Body(new ZodValidationPipe(createTenantSchema)) dto: CreateTenantDto,
  ) {
    const tenant = await this.createTenantUseCase.execute(dto);
    return { data: tenant };
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'List all tenants' })
  async list() {
    const tenants = await this.tenantRepo.findAll();
    return { data: tenants.map((t) => TenantMapper.toResponse(t)) };
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get a tenant by ID' })
  // O pipe por parametro e obrigatorio: sem ele um id fora do formato UUID
  // chega a coluna `uuid` e o 22P02 do Postgres vira 500 no filtro global.
  async findOne(@Param('id', new UuidValidationPipe()) id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) {
      throw new DomainException(
        ErrorCode.TENANT_NOT_FOUND,
        'Tenant não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return { data: TenantMapper.toResponse(tenant) };
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Update a tenant' })
  async update(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) {
      throw new DomainException(
        ErrorCode.TENANT_NOT_FOUND,
        'Tenant não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.email !== undefined) tenant.email = dto.email;
    if (dto.phone !== undefined) tenant.phone = dto.phone;
    if (dto.isActive !== undefined) tenant.isActive = dto.isActive;
    const updated = await this.tenantRepo.update(tenant);
    return { data: TenantMapper.toResponse(updated) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Soft delete a tenant' })
  async remove(@Param('id', new UuidValidationPipe()) id: string) {
    await this.tenantRepo.softDelete(id);
  }
}
