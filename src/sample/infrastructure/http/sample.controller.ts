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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiCookieAuth,
} from '@nestjs/swagger';
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
import {
  CreateSampleSwagger,
  SampleListResponseSwagger,
  SampleResponseSwagger,
  UpdateSampleSwagger,
} from '../../application/dtos/sample.dto';
import { CreateSampleUseCase } from '../../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../../application/use-cases/delete-sample.use-case';
import { ScheduleSampleDeactivationUseCase } from '../../application/use-cases/schedule-sample-deactivation.use-case';

/**
 * Controller de referencia. Ele so valida a entrada e delega — nenhuma regra de
 * negocio, nenhum acesso a repositorio.
 *
 * Tres convencoes que este arquivo existe para demonstrar:
 *
 * 1. **`@Body(new ZodValidationPipe(schema))`, nunca `@UsePipes(...)`.** O
 *    `@UsePipes` aplica o schema a **todos** os argumentos do handler: no dia em
 *    que a rota ganha um `@Param('id')`, o pipe tenta validar a string do id
 *    contra o schema do body e a rota passa a responder 400 sempre.
 * 2. **`@Roles` por rota, nunca na classe.** Na classe, leitura e escrita
 *    compartilham permissao — quem pode listar passa a poder apagar. Aqui
 *    leitura e ADMIN+USER e escrita e ADMIN.
 * 3. **Swagger completo**: `@ApiOperation`, `@ApiParam`/`@ApiQuery`, `@ApiBody` e
 *    um `@ApiResponse` por status possivel, com `ErrorResponseSwagger` nos erros.
 *    Os tipos de sucesso ja incluem o envelope `{ data }`.
 */
@ApiTags('Samples')
@ApiCookieAuth()
@Controller('v1/samples')
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a sample' })
  @ApiBody({ type: CreateSampleSwagger })
  @ApiResponse({
    status: 201,
    description: 'Sample criado',
    type: SampleResponseSwagger,
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validacao (VALIDATION_ERROR)',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 403,
    description: 'Papel insuficiente (AUTH_INSUFFICIENT_ROLE)',
    type: ErrorResponseSwagger,
  })
  async create(
    @Body(new ZodValidationPipe(createSampleSchema)) dto: CreateSampleDto,
    @TenantId() tenantId: string,
  ) {
    const sample = await this.createSampleUseCase.execute(dto, tenantId);
    return { data: sample };
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'List samples (paginated)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Pagina, a partir de 1. Valor invalido cai em 1.',
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    type: Number,
    example: 20,
    description: 'Itens por pagina, entre 1 e 100. Padrao 20.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de samples',
    type: SampleListResponseSwagger,
  })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.listSamplesUseCase.execute(tenantId, { page, perPage });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a sample by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Sample encontrado',
    type: SampleResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Sample nao encontrado (SAMPLE_NOT_FOUND)',
    type: ErrorResponseSwagger,
  })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const sample = await this.getSampleUseCase.execute(id, tenantId);
    return { data: sample };
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a sample' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateSampleSwagger })
  @ApiResponse({
    status: 200,
    description: 'Sample atualizado',
    type: SampleResponseSwagger,
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validacao (VALIDATION_ERROR)',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Sample nao encontrado (SAMPLE_NOT_FOUND)',
    type: ErrorResponseSwagger,
  })
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft delete a sample' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Sample removido (soft delete)' })
  @ApiResponse({
    status: 404,
    description: 'Sample nao encontrado (SAMPLE_NOT_FOUND)',
    type: ErrorResponseSwagger,
  })
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
  @ApiResponse({
    status: 503,
    description:
      'Fila indisponivel (QUEUE_UNAVAILABLE): o job nao foi enfileirado e o cliente pode repetir a chamada',
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
