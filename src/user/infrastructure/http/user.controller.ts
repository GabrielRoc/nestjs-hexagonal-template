import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles, CurrentUser, TenantId } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { createUserSchema } from '../../application/dtos/user.dto';
import type { CreateUserDto } from '../../application/dtos/user.dto';
import type { RequestUser } from '../../../common/interfaces';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';

@ApiTags('Users')
@Controller('v1/users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createUserSchema))
  @ApiOperation({ summary: 'Create a user' })
  async create(@Body() dto: CreateUserDto, @TenantId() tenantId: string) {
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
  async me(@CurrentUser() currentUser: RequestUser) {
    const user = await this.getCurrentUserUseCase.execute(
      currentUser.userId,
      currentUser.tenantId,
    );
    return { data: user };
  }
}
