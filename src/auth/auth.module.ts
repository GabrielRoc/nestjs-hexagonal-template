import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SuperTokensModule } from 'supertokens-nestjs';
import Session from 'supertokens-node/recipe/session';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Dashboard from 'supertokens-node/recipe/dashboard';

@Module({
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
            EmailPassword.init(),
            Session.init({
              getTokenTransferMethod: () => 'cookie',
              cookieSameSite: 'none',
              cookieSecure: true,
              antiCsrf: 'VIA_CUSTOM_HEADER',
            }),
            Dashboard.init(),
          ],
        };
      },
    }),
  ],
})
export class AuthModule {}
