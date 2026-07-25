import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTypeormEntity } from './persistence/user.typeorm-entity';
import { UserTypeormRepository } from './persistence/user.typeorm-repository';
import { USER_REPOSITORY } from '../domain/ports/user.repository.port';
import { UserController } from './http/user.controller';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { UpdateUserPasswordUseCase } from '../application/use-cases/update-user-password.use-case';
import { ToggleUserActiveUseCase } from '../application/use-cases/toggle-user-active.use-case';
import { DeleteUserUseCase } from '../application/use-cases/delete-user.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([UserTypeormEntity])],
  controllers: [UserController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserTypeormRepository,
    },
    CreateUserUseCase,
    GetCurrentUserUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    UpdateUserPasswordUseCase,
    ToggleUserActiveUseCase,
    DeleteUserUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
