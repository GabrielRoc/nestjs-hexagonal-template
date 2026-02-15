import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTypeormEntity } from './persistence/user.typeorm-entity';
import { UserTypeormRepository } from './persistence/user.typeorm-repository';
import { USER_REPOSITORY } from '../domain/ports/user.repository.port';
import { UserController } from './http/user.controller';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';

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
  ],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
