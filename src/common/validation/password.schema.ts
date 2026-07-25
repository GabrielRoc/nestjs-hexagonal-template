import { z } from 'zod';

/**
 * Politica de senha do template, definida em UM unico lugar.
 *
 * Existem tres caminhos que gravam senha e todos precisam concordar:
 *
 * 1. `POST /api/v1/auth/reset-password` (Zod, ver `reset-password.dto.ts`)
 * 2. `PATCH /api/v1/users/:id/password` (Zod, ver `user.dto.ts`)
 * 3. os endpoints nativos do SuperTokens montados em `/api/auth/*`
 *    (`.../user/password/reset/token` e `.../user/password/reset`), que o
 *    middleware do SDK atende ANTES do router do Nest — nenhum pipe ou guard
 *    do Nest roda neles.
 *
 * Por isso o ponto de aplicacao autoritativo e o `formFields` do
 * `EmailPassword.init()` (ver `auth.module.ts`), que o SuperTokens usa tanto no
 * sign up quanto no formulario de reset e em `updateEmailOrPassword`. O Zod das
 * rotas fica como validacao antecipada: mesma regra, mensagem em portugues e
 * erro no formato `{ error: { code, message, details } }` do template.
 *
 * O limite superior e 99 e nao 128: registrar um validador proprio substitui o
 * `defaultPasswordValidator` do SDK (que recusa `length >= 100`), mas o hash e
 * feito pelo core do SuperTokens e senhas muito longas nao agregam entropia
 * util. Manter 99 mantem Swagger, Zod e provedor dizendo a mesma coisa.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 99;

export const passwordSchema = z
  .string('Senha inválida')
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Máximo ${PASSWORD_MAX_LENGTH} caracteres`)
  .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Deve conter pelo menos um número');

/**
 * Adaptador da politica para o contrato de `formFields` do SuperTokens:
 * devolve `undefined` quando a senha passa e a lista de violacoes quando nao.
 * O SDK propaga essa string em `failureReason` de
 * `PASSWORD_POLICY_VIOLATED_ERROR`, entao ela chega ao cliente em portugues.
 */
export function validatePasswordPolicy(
  value: unknown,
): Promise<string | undefined> {
  const result = passwordSchema.safeParse(value);
  if (result.success) {
    return Promise.resolve(undefined);
  }
  return Promise.resolve(
    result.error.issues.map((issue) => issue.message).join('; '),
  );
}
