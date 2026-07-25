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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  Roles,
  CurrentUser,
  SkipAuditBody,
  TenantId,
} from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { UuidParamPipe } from '../../../common/pipes/uuid-param.pipe';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  ErrorResponseSwagger,
  PaginationMetaSwagger,
} from '../../../common/swagger/common.swagger';
import {
  createUserSchema,
  setUserActiveSchema,
  SetUserActiveSwagger,
  updateUserSchema,
  updateUserPasswordSchema,
  UpdateUserPasswordSwagger,
} from '../../application/dtos/user.dto';
import type {
  CreateUserDto,
  SetUserActiveDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from '../../application/dtos/user.dto';
import type { RequestUser } from '../../../common/interfaces';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { UpdateUserPasswordUseCase } from '../../application/use-cases/update-user-password.use-case';
import { SetUserActiveUseCase } from '../../application/use-cases/set-user-active.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';

@ApiTags('Users')
@Controller('v1/users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly updateUserPasswordUseCase: UpdateUserPasswordUseCase,
    private readonly setUserActiveUseCase: SetUserActiveUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users of the tenant (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'perPage', required: false, example: '20' })
  @ApiExtraModels(PaginationMetaSwagger)
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuários do tenant',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        meta: {
          type: 'object',
          properties: {
            pagination: { $ref: getSchemaPath(PaginationMetaSwagger) },
          },
        },
      },
    },
  })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    // O use case ja devolve o envelope { data, meta.pagination }.
    return this.listUsersUseCase.execute(tenantId, { page, perPage });
  }

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a user' })
  @ApiResponse({
    status: 409,
    description: 'E-mail já cadastrado no tenant',
    type: ErrorResponseSwagger,
  })
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
    @TenantId() tenantId: string,
  ) {
    // TODO: Integrate with SuperTokens to create the auth user first
    // and pass the supertokensUserId here
    const user = await this.createUserUseCase.execute(
      dto,
      tenantId,
      'pending-supertokens-id',
    );
    return { data: user };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
    type: ErrorResponseSwagger,
  })
  async me(@CurrentUser() currentUser: RequestUser) {
    const user = await this.getCurrentUserUseCase.execute(
      currentUser.userId,
      currentUser.tenantId,
    );
    return { data: user };
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 403,
    description: 'Alteração do próprio papel ou último administrador',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
    type: ErrorResponseSwagger,
  })
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const user = await this.updateUserUseCase.execute(
      id,
      tenantId,
      currentUser.userId,
      dto,
    );
    return { data: user };
  }

  @Patch(':id/password')
  @Roles(Role.ADMIN)
  // O corpo existe apenas para transportar a senha: nada dele vai para
  // audit_logs (o interceptor global ja redige, isto e a segunda camada).
  @SkipAuditBody()
  @ApiOperation({ summary: 'Update a user password' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateUserPasswordSwagger })
  @ApiResponse({
    status: 400,
    description: 'Senha fora da política de segurança',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
    type: ErrorResponseSwagger,
  })
  async updatePassword(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateUserPasswordSchema))
    dto: UpdateUserPasswordDto,
    @TenantId() tenantId: string,
  ) {
    await this.updateUserPasswordUseCase.execute(id, tenantId, dto.newPassword);
    return { data: { message: 'Senha atualizada com sucesso' } };
  }

  // Estado desejado no corpo, nao toggle: repetir a requisicao apos uma falha
  // parcial precisa reexecutar a mesma intencao, nunca invertê-la.
  @Patch(':id/active')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activate or deactivate a user (idempotent)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: SetUserActiveSwagger })
  @ApiResponse({
    status: 403,
    description: 'Autodesativação ou último administrador ativo',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
    type: ErrorResponseSwagger,
  })
  async setActive(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(setUserActiveSchema)) dto: SetUserActiveDto,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const user = await this.setUserActiveUseCase.execute(
      id,
      tenantId,
      currentUser.userId,
      dto.isActive,
    );
    return { data: user };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Remove a identidade no provedor de autenticação (irreversível) e ' +
      'marca o registro local com deletedAt. Não há restore: reativar o ' +
      'acesso exige criar o usuário novamente.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 403,
    description: 'Autoexclusão ou último administrador ativo',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
    type: ErrorResponseSwagger,
  })
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    await this.deleteUserUseCase.execute(id, tenantId, currentUser.userId);
  }
}
