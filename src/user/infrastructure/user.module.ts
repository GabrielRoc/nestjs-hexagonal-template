import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTypeormEntity } from './persistence/user.typeorm-entity';
import { UserTypeormRepository } from './persistence/user.typeorm-repository';
import { USER_REPOSITORY } from '../domain/ports/user.repository.port';
import { UserController } from './http/user.controller';
import { AuthModule } from '../../auth/auth.module';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { UpdateUserPasswordUseCase } from '../application/use-cases/update-user-password.use-case';
import { SetUserActiveUseCase } from '../application/use-cases/set-user-active.use-case';
import { DeleteUserUseCase } from '../application/use-cases/delete-user.use-case';

@Module({
  // AuthModule entra por causa do AUTH_PROVIDER: trocar senha, revogar sessao e
  // remover identidade passam pelo port do provedor, nunca pelo SDK direto.
  imports: [TypeOrmModule.forFeature([UserTypeormEntity]), AuthModule],
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
    SetUserActiveUseCase,
    DeleteUserUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
