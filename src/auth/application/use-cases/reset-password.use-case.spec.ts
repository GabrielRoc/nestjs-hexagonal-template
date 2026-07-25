import { HttpStatus } from '@nestjs/common';
import { ResetPasswordUseCase } from './reset-password.use-case';
import type { AuthProviderPort } from '../../domain/ports/auth-provider.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

type AuthProviderMock = jest.Mocked<
  Pick<
    AuthProviderPort,
    'consumePasswordResetToken' | 'updatePassword' | 'revokeAllSessions'
  >
>;

const PROVIDER_USER_ID = 'st-1';
const DTO = {
  token: 'tok-1',
  newPassword: 'NovaSenha123',
  confirmPassword: 'NovaSenha123',
};

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let authProvider: AuthProviderMock;

  beforeEach(() => {
    authProvider = {
      consumePasswordResetToken: jest.fn().mockResolvedValue({
        status: 'OK',
        providerUserId: PROVIDER_USER_ID,
        email: 'joao@email.com',
      }),
      updatePassword: jest.fn().mockResolvedValue({ status: 'OK' }),
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new ResetPasswordUseCase(
      authProvider as unknown as AuthProviderPort,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('troca a senha no id do provedor devolvido pelo token', async () => {
    await useCase.execute(DTO);

    expect(authProvider.updatePassword).toHaveBeenCalledWith(
      PROVIDER_USER_ID,
      DTO.newPassword,
    );
  });

  it('revoga todas as sessoes depois da troca', async () => {
    // Quem pede reset costuma ter perdido o controle da conta: as sessoes
    // abertas com a senha antiga precisam morrer.
    await useCase.execute(DTO);

    expect(authProvider.revokeAllSessions).toHaveBeenCalledWith(
      PROVIDER_USER_ID,
    );
    expect(
      authProvider.revokeAllSessions.mock.invocationCallOrder[0],
    ).toBeGreaterThan(authProvider.updatePassword.mock.invocationCallOrder[0]);
  });

  it('recusa token invalido sem tentar trocar a senha', async () => {
    authProvider.consumePasswordResetToken.mockResolvedValue({
      status: 'INVALID_TOKEN',
    });

    await expect(useCase.execute(DTO)).rejects.toBeInstanceOf(DomainException);
    await expect(useCase.execute(DTO)).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_TOKEN_INVALID,
      httpStatus: HttpStatus.BAD_REQUEST,
    });

    expect(authProvider.updatePassword).not.toHaveBeenCalled();
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('mapeia violacao de politica para 400 avisando que o link foi consumido', async () => {
    // O token e de uso unico e ja foi queimado no consume: a mensagem precisa
    // pedir um link novo, senao o usuario repete o mesmo e recebe 'inválido'.
    authProvider.updatePassword.mockResolvedValue({
      status: 'POLICY_VIOLATED',
      failureReason: 'Deve conter pelo menos uma letra maiúscula',
    });

    const error = await useCase
      .execute(DTO)
      .catch((thrown: DomainException) => thrown);

    expect(error).toMatchObject({
      code: ErrorCode.USER_PASSWORD_POLICY_VIOLATED,
      httpStatus: HttpStatus.BAD_REQUEST,
    });
    expect((error as DomainException).message).toContain('novo link');
    expect((error as DomainException).details).toEqual([
      {
        field: 'newPassword',
        message: 'Deve conter pelo menos uma letra maiúscula',
      },
    ]);
    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('mapeia id desconhecido no provedor para 404, como a rota administrativa', async () => {
    authProvider.updatePassword.mockResolvedValue({
      status: 'UNKNOWN_USER_ID',
    });

    await expect(useCase.execute(DTO)).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });
  });

  it('trata status inesperado do provedor como 500 e nao revoga sessoes', async () => {
    authProvider.updatePassword.mockResolvedValue({
      status: 'UNEXPECTED',
      detail: 'EMAIL_ALREADY_EXISTS_ERROR',
    });

    await expect(useCase.execute(DTO)).rejects.toMatchObject({
      code: ErrorCode.USER_PASSWORD_UPDATE_FAILED,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    expect(authProvider.revokeAllSessions).not.toHaveBeenCalled();
  });
});
