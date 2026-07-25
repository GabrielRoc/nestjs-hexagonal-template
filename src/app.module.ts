import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  SuperTokensAuthGuard,
  SuperTokensExceptionFilter,
} from 'supertokens-nestjs';

import {
  antiBotConfig,
  appConfig,
  databaseConfig,
  supertokensConfig,
} from './config';
import { DatabaseModule } from './database/database.module';
import { AntiBotModule } from './anti-bot/infrastructure/anti-bot.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './audit-log/infrastructure/audit-log.module';
import { LoggerModule } from './logger/logger.module';
import { TenantModule } from './tenant/infrastructure/tenant.module';
import { UserModule } from './user/infrastructure/user.module';
import { SampleModule } from './sample/infrastructure/sample.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [antiBotConfig, appConfig, databaseConfig, supertokensConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),
    DatabaseModule,
    // Registrado por default para publicar GET /api/v1/anti-bot/*. Nenhuma rota
    // existente ganha camada nova por isso: as camadas entram por `@AntiBot()`
    // na rota, e o TurnstileGuard das rotas de auth fica inerte enquanto
    // TURNSTILE_ENABLED nao for `true`.
    AntiBotModule,
    AuthModule,
    AuditLogModule,
    LoggerModule,
    TenantModule,
    UserModule,
    SampleModule,
    StorageModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    // Exception filters (order matters: last registered runs first)
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: SuperTokensExceptionFilter,
    },
    // Guards (order matters: first registered runs first)
    {
      provide: APP_GUARD,
      useClass: SuperTokensAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
