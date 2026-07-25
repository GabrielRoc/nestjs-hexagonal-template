import { HttpStatus } from '@nestjs/common';
import { DeleteUserUseCase } from './delete-user.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import type { AuthProviderPort } from '../../../auth/domain/ports/auth-provider.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<
  Pick<
    UserRepositoryPort,
    'findById' | 'softDelete' | 'countActiveAdminsByTenantId'
  >
>;
type AuthProviderMock = jest.Mocked<
  Pick<AuthProviderPort, 'revokeAllSessions' | 'deleteUser'>
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

describe('DeleteUserUseCase', () => {
  let useCase: DeleteUserUseCase;
  let repo: UserRepoMock;
  let authProvider: AuthProviderMock;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      countActiveAdminsByTenantId: jest.fn(),
    };
    authProvider = {
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new DeleteUserUseCase(
      repo as unknown as UserRepositoryPort,
      authProvider as unknown as AuthProviderPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recusa a exclusao da propria conta antes de tocar no repositorio', async () => {
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_CANNOT_DELETE_SELF,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(authProvider.deleteUser).not.toHaveBeenCalled();
  });

  it('lanca USER_NOT_FOUND quando o usuario nao existe no tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
    expect(authProvider.deleteUser).not.toHaveBeenCalled();
  });

  it('recusa excluir o ultimo administrador ativo do tenant', async () => {
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
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(authProvider.deleteUser).not.toHaveBeenCalled();
  });

  it('exclui um admin quando o tenant ainda tem outro administrador ativo', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(2);

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(repo.softDelete).toHaveBeenCalledWith(TARGET_ID, TENANT_ID);
  });

  it('exclui um admin inativo sem consultar a contagem de admins ativos', async () => {
    // Admin inativo nao entra em countActiveAdminsByTenantId: excluí-lo nao
    // reduz o numero de administradores ativos do tenant.
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: false }),
    );

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
    expect(repo.softDelete).toHaveBeenCalledWith(TARGET_ID, TENANT_ID);
  });

  it('nao consulta a contagem de admins ao excluir um usuario comum', async () => {
    repo.findById.mockResolvedValue(makeUser({ role: Role.USER }));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('revoga as sessoes e remove a conta no provedor pelo id do provedor', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(authProvider.revokeAllSessions).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(authProvider.deleteUser).toHaveBeenCalledWith(SUPERTOKENS_ID);
  });

  it('limpa o provedor ANTES do soft delete local', async () => {
    // O passo local e o unico transacional: comita-lo primeiro tornava a
    // operacao irrepetivel, porque findById nao ve linha soft-deleted.
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(authProvider.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      repo.softDelete.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['revogacao de sessoes', 'revokeAllSessions'],
    ['remocao da identidade', 'deleteUser'],
  ] as const)(
    'nao marca deletedAt quando a %s falha, mantendo a exclusao repetivel',
    async (_label, method) => {
      // Sem isto o estado final era: linha soft-deleted + conta viva no
      // provedor, e todo DELETE seguinte respondia 404 — conta orfa para sempre.
      repo.findById.mockResolvedValue(makeUser());
      authProvider[method].mockRejectedValue(new Error('supertokens down'));

      await expect(
        useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID),
      ).rejects.toThrow('supertokens down');

      expect(repo.softDelete).not.toHaveBeenCalled();
    },
  );

  it('exclui apenas dentro do tenant da requisicao', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, 'outro-tenant', CURRENT_ID);

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
    expect(repo.softDelete).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });
});
