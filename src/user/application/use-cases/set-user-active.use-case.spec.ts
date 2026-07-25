import { HttpStatus } from '@nestjs/common';
import { SetUserActiveUseCase } from './set-user-active.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import type { AuthProviderPort } from '../../../auth/domain/ports/auth-provider.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<
  Pick<
    UserRepositoryPort,
    'findById' | 'update' | 'countActiveAdminsByTenantId'
  >
>;
type AuthProviderMock = jest.Mocked<
  Pick<AuthProviderPort, 'revokeAllSessions'>
>;

const TENANT_ID = 'tenant-1';
const TARGET_ID = 'user-target';
const CURRENT_ID = 'user-current';
const SUPERTOKENS_ID = 'st-target';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: TARGET_ID,
    tenantId: TENANT_ID,
    supertokensUserId: SUPERTOKENS_ID,
    name: 'Alvo',
    email: 'alvo@example.com',
    role: Role.USER,
    isActive: true,
    ...overrides,
  });
}

describe('SetUserActiveUseCase', () => {
  let useCase: SetUserActiveUseCase;
  let repo: UserRepoMock;
  let authProvider: AuthProviderMock;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn((user: User) => Promise.resolve(user)),
      countActiveAdminsByTenantId: jest.fn(),
    };
    authProvider = {
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new SetUserActiveUseCase(
      repo as unknown as UserRepositoryPort,
      authProvider as unknown as AuthProviderPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recusa a desativacao da propria conta antes de tocar no repositorio', async () => {
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID, false),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID, false),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_CANNOT_DEACTIVATE_SELF,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('lanca USER_NOT_FOUND quando o usuario nao existe no tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, false),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, TENANT_ID);
    expect(repo.update).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('recusa desativar o ultimo administrador ativo do tenant', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(1);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, false),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_LAST_ADMIN,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.countActiveAdminsByTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(repo.update).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('desativa um administrador quando o tenant ainda tem outro ativo', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(2);

    const result = await useCase.execute(
      TARGET_ID,
      TENANT_ID,
      CURRENT_ID,
      false,
    );

    expect(result.isActive).toBe(false);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TARGET_ID, isActive: false }),
    );
  });

  it('revoga as sessoes ANTES de persistir a desativacao', async () => {
    // Se a revogacao falhar, nada foi comitado: repetir a requisicao reexecuta a
    // revogacao em vez de deixar a linha inativa com sessao viva.
    repo.findById.mockResolvedValue(makeUser({ isActive: true }));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, false);

    expect(authProvider.revokeAllSessions).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(
      authProvider.revokeAllSessions.mock.invocationCallOrder[0],
    ).toBeLessThan(repo.update.mock.invocationCallOrder[0]);
  });

  it('nao persiste quando a revogacao de sessoes falha', async () => {
    repo.findById.mockResolvedValue(makeUser({ isActive: true }));
    authProvider.revokeAllSessions.mockRejectedValue(
      new Error('supertokens down'),
    );

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, false),
    ).rejects.toThrow('supertokens down');

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('repetir a desativacao de um usuario ja inativo revoga de novo, sem reativar', async () => {
    // Este e o retry depois de uma falha parcial: a operacao recebe o estado
    // desejado, entao a segunda chamada nao pode inverter nada.
    repo.findById.mockResolvedValue(makeUser({ isActive: false }));

    const result = await useCase.execute(
      TARGET_ID,
      TENANT_ID,
      CURRENT_ID,
      false,
    );

    expect(result.isActive).toBe(false);
    expect(authProvider.revokeAllSessions).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('nao consulta a contagem de admins ao desativar um usuario comum', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.USER, isActive: true }),
    );

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, false);

    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('reativa um admin inativo sem checar a regra do ultimo admin', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: false }),
    );

    const result = await useCase.execute(
      TARGET_ID,
      TENANT_ID,
      CURRENT_ID,
      true,
    );

    expect(result.isActive).toBe(true);
    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('nao revoga sessoes ao reativar um usuario', async () => {
    repo.findById.mockResolvedValue(makeUser({ isActive: false }));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, true);

    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('busca o usuario sempre escopado pelo tenant da requisicao', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, 'outro-tenant', CURRENT_ID, false);

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });
});
