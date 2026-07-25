import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Roles, CurrentUser, TenantId } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ErrorResponseSwagger } from '../../../common/swagger/common.swagger';
import {
  createUserSchema,
  updateUserSchema,
  updateUserPasswordSchema,
} from '../../application/dtos/user.dto';
import type {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from '../../application/dtos/user.dto';
import type { RequestUser } from '../../../common/interfaces';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { UpdateUserPasswordUseCase } from '../../application/use-cases/update-user-password.use-case';
import { ToggleUserActiveUseCase } from '../../application/use-cases/toggle-user-active.use-case';
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
    private readonly toggleUserActiveUseCase: ToggleUserActiveUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users of the tenant' })
  async list(@TenantId() tenantId: string) {
    const users = await this.listUsersUseCase.execute(tenantId);
    return { data: users };
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
    @Param('id', ParseUUIDPipe) id: string,
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
  @ApiOperation({ summary: 'Update a user password' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserPasswordSchema))
    dto: UpdateUserPasswordDto,
    @TenantId() tenantId: string,
  ) {
    await this.updateUserPasswordUseCase.execute(id, tenantId, dto.newPassword);
    return { data: { message: 'Senha atualizada com sucesso' } };
  }

  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Toggle a user active status' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
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
  async toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const user = await this.toggleUserActiveUseCase.execute(
      id,
      tenantId,
      currentUser.userId,
    );
    return { data: user };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a user' })
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
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    await this.deleteUserUseCase.execute(id, tenantId, currentUser.userId);
  }
}
