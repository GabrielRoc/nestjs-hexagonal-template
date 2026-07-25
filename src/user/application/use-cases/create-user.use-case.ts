import { Inject, Injectable, HttpStatus, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user.repository.port';
import type { CreateUserDto, UserResponseDto } from '../dtos/user.dto';
import { UserMapper } from '../mappers/user.mapper';
import { User } from '../../domain/entities/user.entity';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

@Injectable()
export class CreateUserUseCase {
  private readonly logger = new Logger(CreateUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(
    dto: CreateUserDto,
    tenantId: string,
    supertokensUserId: string,
  ): Promise<UserResponseDto> {
    const existingEmail = await this.userRepo.findByEmail(dto.email, tenantId);
    if (existingEmail) {
      throw new DomainException(
        ErrorCode.USER_EMAIL_ALREADY_EXISTS,
        'E-mail já cadastrado neste tenant',
        HttpStatus.CONFLICT,
      );
    }

    const user = new User({
      tenantId,
      supertokensUserId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      role: dto.role,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`User created: ${saved.id} for tenant ${tenantId}`);
    return UserMapper.toResponse(saved);
  }
}
