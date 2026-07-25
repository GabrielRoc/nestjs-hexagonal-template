import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import type { UpdateUserDto, UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';
import { User } from '../../domain/entities/user.entity';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(
    userId: string,
    tenantId: string,
    currentUserId: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(userId, tenantId);
    if (!user) {
      throw new DomainException(
        ErrorCode.USER_NOT_FOUND,
        'Usuário não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    // Escalonamento de privilegio: um admin nao pode promover a si mesmo nem se
    // rebaixar para escapar de uma regra que dependa do proprio role.
    if (dto.role && userId === currentUserId) {
      throw new DomainException(
        ErrorCode.USER_CANNOT_CHANGE_OWN_ROLE,
        'Não é possível alterar o próprio papel',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.assertNotLastAdmin(user, tenantId, dto.role);

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.role !== undefined) user.role = dto.role;

    const updated = await this.userRepo.update(user);
    return UserMapper.toResponse(updated);
  }

  /**
   * Rebaixar o unico admin ativo deixaria o tenant sem ninguem capaz de
   * administrar usuarios — o mesmo bloqueio existe na desativacao e na exclusao.
   *
   * A regra vale apenas para um admin ATIVO: countActiveAdminsByTenantId nao
   * conta admins inativos, entao rebaixar um admin inativo nao muda a contagem
   * e nao pode trancar o tenant (mesmo criterio de ToggleUserActiveUseCase).
   */
  private async assertNotLastAdmin(
    user: User,
    tenantId: string,
    newRole?: Role,
  ): Promise<void> {
    if (
      !newRole ||
      !user.isActive ||
      user.role !== Role.ADMIN ||
      newRole === Role.ADMIN
    ) {
      return;
    }

    const activeAdmins =
      await this.userRepo.countActiveAdminsByTenantId(tenantId);
    if (activeAdmins <= 1) {
      throw new DomainException(
        ErrorCode.USER_LAST_ADMIN,
        'Não é possível rebaixar o último administrador ativo',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
