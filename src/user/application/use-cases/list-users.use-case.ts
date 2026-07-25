import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import type { UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';
import {
  parsePaginationParams,
  buildPaginationMeta,
} from '../../../common/utils/pagination.util';
import type { PaginatedResponse } from '../../../common/interfaces';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  /**
   * A lista de usuarios de um tenant cresce sem limite, entao a rota e paginada
   * como as demais listagens do template (`{ data, meta.pagination }`).
   */
  async execute(
    tenantId: string,
    query: { page?: string; perPage?: string },
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const { page, perPage } = parsePaginationParams(query);
    const [users, total] = await this.userRepo.findAll(tenantId, page, perPage);

    return {
      data: users.map((user) => UserMapper.toResponse(user)),
      meta: {
        pagination: buildPaginationMeta(total, page, perPage),
      },
    };
  }
}
