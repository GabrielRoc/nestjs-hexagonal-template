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
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles, TenantId } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ErrorResponseSwagger } from '../../../common/swagger/common.swagger';
import {
  createSampleSchema,
  scheduleSampleDeactivationSchema,
  updateSampleSchema,
} from '../../application/dtos/sample.dto';
import type {
  CreateSampleDto,
  ScheduleSampleDeactivationDto,
  UpdateSampleDto,
} from '../../application/dtos/sample.dto';
import { CreateSampleUseCase } from '../../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../../application/use-cases/delete-sample.use-case';
import { ScheduleSampleDeactivationUseCase } from '../../application/use-cases/schedule-sample-deactivation.use-case';

@ApiTags('Samples')
@Controller('v1/samples')
@Roles(Role.ADMIN, Role.USER)
export class SampleController {
  constructor(
    private readonly createSampleUseCase: CreateSampleUseCase,
    private readonly getSampleUseCase: GetSampleUseCase,
    private readonly listSamplesUseCase: ListSamplesUseCase,
    private readonly updateSampleUseCase: UpdateSampleUseCase,
    private readonly deleteSampleUseCase: DeleteSampleUseCase,
    private readonly scheduleSampleDeactivationUseCase: ScheduleSampleDeactivationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createSampleSchema))
  @ApiOperation({ summary: 'Create a sample' })
  async create(@Body() dto: CreateSampleDto, @TenantId() tenantId: string) {
    const sample = await this.createSampleUseCase.execute(dto, tenantId);
    return { data: sample };
  }

  @Get()
  @ApiOperation({ summary: 'List samples (paginated)' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.listSamplesUseCase.execute(tenantId, { page, perPage });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sample by ID' })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const sample = await this.getSampleUseCase.execute(id, tenantId);
    return { data: sample };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sample' })
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(updateSampleSchema)) dto: UpdateSampleDto,
  ) {
    const sample = await this.updateSampleUseCase.execute(id, tenantId, dto);
    return { data: sample };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a sample' })
  async remove(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.deleteSampleUseCase.execute(id, tenantId);
  }

  // Exemplo de rota que apenas enfileira trabalho: responde 202 assim que o job
  // entra no Redis, sem esperar a execucao. 202 (e nao 200/201) porque o efeito
  // pedido ainda nao aconteceu quando a resposta sai.
  @Post(':id/deactivations')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Schedule sample deactivation (background job)' })
  @ApiResponse({ status: 202, description: 'Job de desativacao enfileirado' })
  @ApiResponse({
    status: 404,
    description: 'Sample nao encontrado',
    type: ErrorResponseSwagger,
  })
  async scheduleDeactivation(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(scheduleSampleDeactivationSchema))
    dto: ScheduleSampleDeactivationDto,
  ) {
    await this.scheduleSampleDeactivationUseCase.execute(
      id,
      tenantId,
      dto.delayMs,
    );
    return { data: { scheduled: true } };
  }
}
