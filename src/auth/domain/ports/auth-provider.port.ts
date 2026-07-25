export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

/** Resultado normalizado de uma troca de senha no provedor. */
export type UpdatePasswordResult =
  | { status: 'OK' }
  | { status: 'UNKNOWN_USER_ID' }
  | { status: 'POLICY_VIOLATED'; failureReason: string }
  | { status: 'UNEXPECTED'; detail: string };

/** Resultado normalizado do consumo de um token de redefinicao. */
export type ConsumeResetTokenResult =
  | { status: 'OK'; providerUserId: string; email: string }
  | { status: 'INVALID_TOKEN' };

/**
 * Contrato com o provedor de identidade (SuperTokens neste template).
 *
 * Existe para que os use cases de `auth` e de `user` nao importem
 * `supertokens-node` direto — trocar o provedor deve custar um adapter novo, e
 * os testes de use case mockam este port em vez de espionar o SDK.
 *
 * Os ids trafegados aqui sao SEMPRE do provedor (`user.supertokensUserId`),
 * nunca o id de dominio da tabela `users`.
 */
export interface AuthProviderPort {
  /**
   * Id do provedor para o login por e-mail/senha, ou `null` quando nao existe
   * conta emailpassword com esse e-mail.
   */
  findEmailPasswordUserIdByEmail(email: string): Promise<string | null>;

  /** `false` quando o provedor recusou o envio (id desconhecido, por exemplo). */
  sendPasswordResetEmail(
    providerUserId: string,
    email: string,
  ): Promise<boolean>;

  /** Consome o token de uso unico. Sucesso invalida o token. */
  consumePasswordResetToken(token: string): Promise<ConsumeResetTokenResult>;

  updatePassword(
    providerUserId: string,
    newPassword: string,
  ): Promise<UpdatePasswordResult>;

  revokeAllSessions(providerUserId: string): Promise<void>;

  /**
   * Remove a identidade no provedor. E IRREVERSIVEL e idempotente: chamar com um
   * id que nao existe mais nao falha.
   */
  deleteUser(providerUserId: string): Promise<void>;
}
