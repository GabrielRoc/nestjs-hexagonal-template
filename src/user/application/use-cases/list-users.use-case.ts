import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import type { UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(tenantId: string): Promise<UserResponseDto[]> {
    const users = await this.userRepo.findAll(tenantId);
    return users.map((user) => UserMapper.toResponse(user));
  }
}
