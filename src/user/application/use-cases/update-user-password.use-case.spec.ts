import { HttpStatus } from '@nestjs/common';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import { UpdateUserPasswordUseCase } from './update-user-password.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<Pick<UserRepositoryPort, 'findById'>>;

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
  let updateEmailOrPassword: jest.SpiedFunction<
    typeof EmailPassword.updateEmailOrPassword
  >;
  let revokeAllSessionsForUser: jest.SpiedFunction<
    typeof Session.revokeAllSessionsForUser
  >;

  beforeEach(() => {
    repo = { findById: jest.fn() };
    useCase = new UpdateUserPasswordUseCase(
      repo as unknown as UserRepositoryPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(useCase['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(useCase['logger'], 'error').mockImplementation(() => undefined);
    updateEmailOrPassword = jest
      .spyOn(EmailPassword, 'updateEmailOrPassword')
      .mockResolvedValue({ status: 'OK' });
    revokeAllSessionsForUser = jest
      .spyOn(Session, 'revokeAllSessionsForUser')
      .mockResolvedValue([]);
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

    expect(updateEmailOrPassword).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
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

    expect(updateEmailOrPassword).toHaveBeenCalledTimes(1);
    const input = updateEmailOrPassword.mock.calls[0][0];
    expect(input.recipeUserId.getAsString()).toBe(SUPERTOKENS_ID);
    expect(input.recipeUserId.getAsString()).not.toBe(TARGET_ID);
    expect(input.password).toBe(NEW_PASSWORD);
  });

  it('nao envia email no payload para nao alterar o login do usuario', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD);

    expect(updateEmailOrPassword.mock.calls[0][0].email).toBeUndefined();
  });

  it('revoga todas as sessoes do usuario depois da troca bem-sucedida', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).resolves.toBeUndefined();

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(SUPERTOKENS_ID);
    expect(
      revokeAllSessionsForUser.mock.invocationCallOrder[0],
    ).toBeGreaterThan(updateEmailOrPassword.mock.invocationCallOrder[0]);
  });

  it('mapeia UNKNOWN_USER_ID_ERROR para USER_NOT_FOUND e nao revoga sessoes', async () => {
    repo.findById.mockResolvedValue(makeUser());
    updateEmailOrPassword.mockResolvedValue({
      status: 'UNKNOWN_USER_ID_ERROR',
    });

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('mapeia PASSWORD_POLICY_VIOLATED_ERROR para 400 e nao revoga sessoes', async () => {
    repo.findById.mockResolvedValue(makeUser());
    updateEmailOrPassword.mockResolvedValue({
      status: 'PASSWORD_POLICY_VIOLATED_ERROR',
      failureReason: 'Password must contain at least one number',
    });

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
      httpStatus: HttpStatus.BAD_REQUEST,
    });

    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('trata status inesperado do provedor como 500 e nao revoga sessoes', async () => {
    repo.findById.mockResolvedValue(makeUser());
    updateEmailOrPassword.mockResolvedValue({
      status: 'EMAIL_ALREADY_EXISTS_ERROR',
    });

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_PASSWORD_UPDATE_FAILED,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('propaga a falha quando a revogacao de sessoes nao acontece', async () => {
    // A senha ja mudou: se a revogacao falhar, o chamador precisa saber que as
    // sessoes antigas continuam validas.
    repo.findById.mockResolvedValue(makeUser());
    revokeAllSessionsForUser.mockRejectedValue(new Error('supertokens down'));

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, NEW_PASSWORD),
    ).rejects.toThrow('supertokens down');
  });
});
