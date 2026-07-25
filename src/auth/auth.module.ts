import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SuperTokensModule } from 'supertokens-nestjs';
import Session from 'supertokens-node/recipe/session';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Dashboard from 'supertokens-node/recipe/dashboard';
import { validatePasswordPolicy } from '../common/validation/password.schema';
import { AUTH_PROVIDER } from './domain/ports/auth-provider.port';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { AuthController } from './infrastructure/http/auth.controller';
import { SupertokensAuthProviderAdapter } from './infrastructure/supertokens-auth-provider.adapter';

@Module({
  controllers: [AuthController],
  imports: [
    SuperTokensModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionUri = config.get<string>('supertokens.connectionUri')!;
        const apiKey = config.get<string>('supertokens.apiKey');
        const appName = config.get<string>('supertokens.appName')!;
        const apiDomain = config.get<string>('supertokens.apiDomain')!;
        const websiteDomain = config.get<string>('supertokens.websiteDomain')!;

        return {
          framework: 'express' as const,
          supertokens: {
            connectionURI: connectionUri,
            ...(apiKey && { apiKey }),
          },
          appInfo: {
            appName,
            apiDomain,
            websiteDomain,
            apiBasePath: '/api/auth',
            websiteBasePath: '/auth',
          },
          recipeList: [
            EmailPassword.init({
              // Ponto de aplicacao AUTORITATIVO da politica de senha. O SDK usa
              // este validador no sign up, no formulario nativo de reset
              // (`/api/auth/user/password/reset`, atendido pelo middleware antes
              // do router do Nest) e em `updateEmailOrPassword`. Sem ele valeria
              // o `defaultPasswordValidator` do SuperTokens (>=8, uma letra, um
              // digito, <100), mais fraco que o que a API declara — e as rotas
              // nativas contornariam a politica do template por completo.
              signUpFeature: {
                formFields: [
                  { id: 'password', validate: validatePasswordPolicy },
                ],
              },
            }),
            // O SDK deriva cookieSameSite, cookieSecure e antiCsrf a partir de
            // apiDomain/websiteDomain; nao sobrescreva sem necessidade real.
            Session.init(),
            Dashboard.init(),
          ],
        };
      },
    }),
  ],
  providers: [
    {
      provide: AUTH_PROVIDER,
      useClass: SupertokensAuthProviderAdapter,
    },
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
  ],
  // Exportado para o UserModule: a administracao de usuarios troca senha, revoga
  // sessao e remove identidade pelo mesmo port, em vez de importar o SDK.
  exports: [AUTH_PROVIDER],
})
export class AuthModule {}
