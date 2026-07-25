import { ForgotPasswordUseCase } from './forgot-password.use-case';
import type { AuthProviderPort } from '../../domain/ports/auth-provider.port';

type AuthProviderMock = jest.Mocked<
  Pick<
    AuthProviderPort,
    'findEmailPasswordUserIdByEmail' | 'sendPasswordResetEmail'
  >
>;

const EMAIL = 'joao@email.com';
const PROVIDER_USER_ID = 'st-1';

describe('ForgotPasswordUseCase', () => {
  let useCase: ForgotPasswordUseCase;
  let authProvider: AuthProviderMock;
  let warnings: string[];

  beforeEach(() => {
    authProvider = {
      findEmailPasswordUserIdByEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };
    useCase = new ForgotPasswordUseCase(
      authProvider as unknown as AuthProviderPort,
    );
    warnings = [];
    jest
      .spyOn(useCase['logger'], 'warn')
      .mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envia o link quando existe conta e-mail/senha', async () => {
    authProvider.findEmailPasswordUserIdByEmail.mockResolvedValue(
      PROVIDER_USER_ID,
    );

    await useCase.execute({ email: EMAIL });

    expect(authProvider.sendPasswordResetEmail).toHaveBeenCalledWith(
      PROVIDER_USER_ID,
      EMAIL,
    );
  });

  it('responde igual quando a conta nao existe, sem enviar e-mail', async () => {
    // Resposta diferente aqui transformaria a rota em oraculo de e-mails
    // cadastrados.
    authProvider.findEmailPasswordUserIdByEmail.mockResolvedValue(null);

    const unknownAccount = await useCase.execute({ email: EMAIL });

    authProvider.findEmailPasswordUserIdByEmail.mockResolvedValue(
      PROVIDER_USER_ID,
    );
    const knownAccount = await useCase.execute({ email: EMAIL });

    expect(unknownAccount).toEqual(knownAccount);
    expect(authProvider.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('mantem a resposta generica quando o provedor recusa o envio', async () => {
    authProvider.findEmailPasswordUserIdByEmail.mockResolvedValue(
      PROVIDER_USER_ID,
    );
    authProvider.sendPasswordResetEmail.mockResolvedValue(false);

    await expect(useCase.execute({ email: EMAIL })).resolves.toEqual({
      message: 'Se o e-mail existir, enviaremos um link',
    });
  });

  it('nao registra o e-mail no log, apenas o dominio', async () => {
    authProvider.findEmailPasswordUserIdByEmail.mockResolvedValue(null);

    await useCase.execute({ email: EMAIL });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('email.com');
    expect(warnings[0]).not.toContain(EMAIL);
  });
});
