import { HttpStatus } from '@nestjs/common';
import * as supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DeleteUserUseCase } from './delete-user.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<
  Pick<
    UserRepositoryPort,
    'findById' | 'softDelete' | 'countActiveAdminsByTenantId'
  >
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
  let deleteUser: jest.SpiedFunction<typeof supertokens.deleteUser>;
  let revokeAllSessionsForUser: jest.SpiedFunction<
    typeof Session.revokeAllSessionsForUser
  >;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      softDelete: jest.fn(),
      countActiveAdminsByTenantId: jest.fn(),
    };
    useCase = new DeleteUserUseCase(repo as unknown as UserRepositoryPort);
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    deleteUser = jest
      .spyOn(supertokens, 'deleteUser')
      .mockResolvedValue({ status: 'OK' });
    revokeAllSessionsForUser = jest
      .spyOn(Session, 'revokeAllSessionsForUser')
      .mockResolvedValue([]);
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
    expect(deleteUser).not.toHaveBeenCalled();
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
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
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
    expect(deleteUser).not.toHaveBeenCalled();
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

  it('revoga as sessoes e remove a conta no provedor pelo id do SuperTokens', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(deleteUser).toHaveBeenCalledWith(SUPERTOKENS_ID);
  });

  it('faz o soft delete local antes de remover a conta no provedor', async () => {
    // A linha local e a fonte de verdade do acesso: se a chamada ao provedor
    // falhar, o usuario ja esta sem acesso a aplicacao.
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID);

    expect(repo.softDelete.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0],
    );
  });

  it('exclui apenas dentro do tenant da requisicao', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, 'outro-tenant', CURRENT_ID);

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
    expect(repo.softDelete).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });
});
