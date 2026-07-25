import { HttpStatus } from '@nestjs/common';
import Session from 'supertokens-node/recipe/session';
import { ToggleUserActiveUseCase } from './toggle-user-active.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<
  Pick<
    UserRepositoryPort,
    'findById' | 'update' | 'countActiveAdminsByTenantId'
  >
>;

const TENANT_ID = 'tenant-1';
const TARGET_ID = 'user-target';
const CURRENT_ID = 'user-current';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: TARGET_ID,
    tenantId: TENANT_ID,
    supertokensUserId: 'st-target',
    name: 'Alvo',
    email: 'alvo@example.com',
    role: Role.USER,
    isActive: true,
    ...overrides,
  });
}

describe('ToggleUserActiveUseCase', () => {
  let useCase: ToggleUserActiveUseCase;
  let repo: UserRepoMock;
  let revokeAllSessionsForUser: jest.SpyInstance;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
      countActiveAdminsByTenantId: jest.fn(),
    };
    useCase = new ToggleUserActiveUseCase(
      repo as unknown as UserRepositoryPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    revokeAllSessionsForUser = jest
      .spyOn(Session, 'revokeAllSessionsForUser')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recusa a desativacao da propria conta antes de tocar no repositorio', async () => {
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_CANNOT_DEACTIVATE_SELF,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('lanca USER_NOT_FOUND quando o usuario nao existe no tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, TENANT_ID);
    expect(repo.update).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('recusa desativar o ultimo administrador ativo do tenant', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(1);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_LAST_ADMIN,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.countActiveAdminsByTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(repo.update).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('desativa um administrador quando o tenant ainda tem outro ativo', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(2);
    repo.update.mockImplementation((user) => Promise.resolve(user));

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(result.isActive).toBe(false);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TARGET_ID, isActive: false }),
    );
  });

  it('revoga todas as sessoes do usuario desativado', async () => {
    repo.findById.mockResolvedValue(makeUser({ isActive: true }));
    repo.update.mockImplementation((user) => Promise.resolve(user));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith('st-target');
  });

  it('nao consulta a contagem de admins ao desativar um usuario comum', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.USER, isActive: true }),
    );
    repo.update.mockImplementation((user) => Promise.resolve(user));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('reativa um admin inativo sem checar a regra do ultimo admin', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: false }),
    );
    repo.update.mockImplementation((user) => Promise.resolve(user));

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(result.isActive).toBe(true);
    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('nao revoga sessoes ao reativar um usuario', async () => {
    repo.findById.mockResolvedValue(makeUser({ isActive: false }));
    repo.update.mockImplementation((user) => Promise.resolve(user));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('busca o usuario sempre escopado pelo tenant da requisicao', async () => {
    repo.findById.mockResolvedValue(makeUser());
    repo.update.mockImplementation((user) => Promise.resolve(user));

    await useCase.execute(TARGET_ID, 'outro-tenant', CURRENT_ID);

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });
});
