import { Injectable, Logger } from '@nestjs/common';
import {
  convertToRecipeUserId,
  deleteUser,
  listUsersByAccountInfo,
} from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import type {
  AuthProviderPort,
  ConsumeResetTokenResult,
  UpdatePasswordResult,
} from '../domain/ports/auth-provider.port';

/**
 * Unico ponto do projeto que fala `supertokens-node` para operacoes de
 * identidade. Trocar o provedor significa escrever outro adapter e reapontar o
 * bind de `AUTH_PROVIDER` no AuthModule — nenhum use case muda.
 *
 * `'public'` e o tenant do SuperTokens (multitenancy do proprio provedor) e nao
 * tem relacao com o `tenantId` da aplicacao: o isolamento do template e
 * row-level no Postgres e todas as identidades vivem no tenant default.
 */
const SUPERTOKENS_TENANT_ID = 'public';

@Injectable()
export class SupertokensAuthProviderAdapter implements AuthProviderPort {
  private readonly logger = new Logger(SupertokensAuthProviderAdapter.name);

  async findEmailPasswordUserIdByEmail(email: string): Promise<string | null> {
    const users = await listUsersByAccountInfo(SUPERTOKENS_TENANT_ID, {
      email,
    });
    const emailPasswordMethod = users
      .flatMap((user) => user.loginMethods)
      .find((method) => method.recipeId === 'emailpassword');

    return emailPasswordMethod?.recipeUserId.getAsString() ?? null;
  }

  async sendPasswordResetEmail(
    providerUserId: string,
    email: string,
  ): Promise<boolean> {
    const result = await EmailPassword.sendResetPasswordEmail(
      SUPERTOKENS_TENANT_ID,
      providerUserId,
      email,
    );
    if (result.status !== 'OK') {
      this.logger.error(
        `sendResetPasswordEmail failed for providerUserId=${providerUserId}: ${result.status}`,
      );
      return false;
    }
    return true;
  }

  async consumePasswordResetToken(
    token: string,
  ): Promise<ConsumeResetTokenResult> {
    const consumed = await EmailPassword.consumePasswordResetToken(
      SUPERTOKENS_TENANT_ID,
      token,
    );
    if (consumed.status !== 'OK') {
      return { status: 'INVALID_TOKEN' };
    }
    return {
      status: 'OK',
      providerUserId: consumed.userId,
      email: consumed.email,
    };
  }

  async updatePassword(
    providerUserId: string,
    newPassword: string,
  ): Promise<UpdatePasswordResult> {
    // Sem `email` no payload: enviar o campo trocaria o login do usuario.
    // `applyPasswordPolicy` fica no default (true) de proposito — a politica
    // registrada em EmailPassword.init e a autoridade final sobre a senha.
    const result = await EmailPassword.updateEmailOrPassword({
      recipeUserId: convertToRecipeUserId(providerUserId),
      password: newPassword,
    });

    switch (result.status) {
      case 'OK':
        return { status: 'OK' };
      case 'UNKNOWN_USER_ID_ERROR':
        return { status: 'UNKNOWN_USER_ID' };
      case 'PASSWORD_POLICY_VIOLATED_ERROR':
        return {
          status: 'POLICY_VIOLATED',
          failureReason: result.failureReason,
        };
      default:
        this.logger.error(`updateEmailOrPassword failed: ${result.status}`);
        return { status: 'UNEXPECTED', detail: result.status };
    }
  }

  async revokeAllSessions(providerUserId: string): Promise<void> {
    await Session.revokeAllSessionsForUser(providerUserId);
  }

  async deleteUser(providerUserId: string): Promise<void> {
    // IRREVERSIVEL: o core do SuperTokens nao tem undo para deleteUser. E
    // idempotente, entao repetir a chamada apos uma falha parcial e seguro.
    await deleteUser(providerUserId);
  }
}
