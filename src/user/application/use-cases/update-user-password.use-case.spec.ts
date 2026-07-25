import { HttpStatus } from '@nestjs/common';
import { UpdateUserPasswordUseCase } from './update-user-password.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import type { AuthProviderPort } from '../../../auth/domain/ports/auth-provider.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<Pick<UserRepositoryPort, 'findById'>>;
type AuthProviderMock = jest.Mocked<
  Pick<AuthProviderPort, 'updatePassword' | 'revokeAllSessions'>
>;

const TENANT_ID = 'tenant-1';
const TARGET_ID = 'user-target';
const SUPERTOKENS_ID = 'st-target';
const NEW_PASSWORD = 'NovaSenha123';

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

describe('UpdateUserPasswordUseCase', () => {
  let useCase: UpdateUserPasswordUseCase;
  let repo: UserRepoMock;
  let authProvider: AuthProviderMock;

  beforeEach(() => {
    repo = { findById: jest.fn() };
    authProvider = {
      updatePassword: jest.fn().mockResolvedValue({ status: 'OK' }),
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new UpdateUserPasswordUseCase(
      repo as unknown as UserRepositoryPort,
      authProvider as unknown as AuthProviderPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(useCase['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lanca USER_NOT_FOUND sem chamar o provedor quando o usuario nao existe no tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(authProvider.updatePassword).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('busca o usuario escopado pelo tenant antes de trocar a senha', async () => {
    // Sem o escopo por tenant, conhecer o id bastaria para trocar a senha de um
    // usuario de outro tenant.
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, 'outro-tenant', NEW_PASSWORD);

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });

  it('troca a senha no id do provedor de autenticacao, nao no id de dominio', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD);

    expect(authProvider.updatePassword).toHaveBeenCalledTimes(1);
    expect(authProvider.updatePassword).toHaveBeenCalledWith(
      SUPERTOKENS_ID,
      NEW_PASSWORD,
    );
    expect(authProvider.updatePassword).not.toHaveBeenCalledWith(
      TARGET_ID,
      NEW_PASSWORD,
    );
  });

  it('revoga todas as sessoes do usuario depois da troca bem-sucedida', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).resolves.toBeUndefined();

    expect(authProvider.revokeAllSessions).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(
      authProvider.revokeAllSessions.mock.invocationCallOrder[0],
    ).toBeGreaterThan(authProvider.updatePassword.mock.invocationCallOrder[0]);
  });

  it('mapeia id desconhecido no provedor para USER_NOT_FOUND e nao revoga sessoes', async () => {
    repo.findById.mockResolvedValue(makeUser());
    authProvider.updatePassword.mockResolvedValue({
      status: 'UNKNOWN_USER_ID',
    });

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('mapeia violacao de politica para 400 e devolve a regra que falhou em details', async () => {
    repo.findById.mockResolvedValue(makeUser());
    authProvider.updatePassword.mockResolvedValue({
      status: 'POLICY_VIOLATED',
      failureReason: 'Deve conter pelo menos um número',
    });

    const error = await useCase
      .execute(TARGET_ID, TENANT_ID, NEW_PASSWORD)
      .catch((thrown: DomainException) => thrown);

    expect(error).toMatchObject({
      code: ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
      httpStatus: HttpStatus.BAD_REQUEST,
    });
    expect((error as DomainException).details).toEqual([
      { field: 'newPassword', message: 'Deve conter pelo menos um número' },
    ]);
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('trata status inesperado do provedor como 500 e nao revoga sessoes', async () => {
    repo.findById.mockResolvedValue(makeUser());
    authProvider.updatePassword.mockResolvedValue({
      status: 'UNEXPECTED',
      detail: 'EMAIL_ALREADY_EXISTS_ERROR',
    });

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_PASSWORD_UPDATE_FAILED,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('propaga a falha quando a revogacao de sessoes nao acontece', async () => {
    // A senha ja mudou: se a revogacao falhar, o chamador precisa saber que as
    // sessoes antigas continuam validas.
    repo.findById.mockResolvedValue(makeUser());
    authProvider.revokeAllSessions.mockRejectedValue(
      new Error('supertokens down'),
    );

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toThrow('supertokens down');
  });
});
