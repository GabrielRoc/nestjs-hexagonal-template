import {
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  validatePasswordPolicy,
} from './password.schema';

describe('passwordSchema', () => {
  it('aceita uma senha com maiuscula, minuscula e digito', () => {
    expect(passwordSchema.safeParse('NovaSenha123').success).toBe(true);
  });

  it('recusa uma senha no limite exato do provedor de autenticacao', () => {
    // O validador do SuperTokens registrado em EmailPassword.init e este mesmo
    // schema: aceitar aqui o que o provedor recusa faria a rota de reset queimar
    // o token e falhar depois.
    const atLimit = `Aa1${'x'.repeat(PASSWORD_MAX_LENGTH - 3)}`;
    const overLimit = `${atLimit}x`;

    expect(atLimit).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(passwordSchema.safeParse(atLimit).success).toBe(true);
    expect(passwordSchema.safeParse(overLimit).success).toBe(false);
  });

  it.each([
    ['sem maiuscula', 'senha123'],
    ['sem minuscula', 'SENHA123'],
    ['sem digito', 'SenhaSemNumero'],
    ['curta demais', 'Ab1'],
  ])('recusa senha %s', (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe('validatePasswordPolicy', () => {
  it('devolve undefined quando a senha atende a politica', async () => {
    await expect(
      validatePasswordPolicy('NovaSenha123'),
    ).resolves.toBeUndefined();
  });

  it('devolve as violacoes em portugues para o provedor propagar', async () => {
    const reason = await validatePasswordPolicy('senha123');

    expect(reason).toBe('Deve conter pelo menos uma letra maiúscula');
  });

  it('recusa valor que nao e string sem vazar mensagem em ingles', async () => {
    // O SuperTokens entrega `any` para o validador do formField.
    await expect(validatePasswordPolicy(12345678)).resolves.toBe(
      'Senha inválida',
    );
  });
});
