import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Valores nao numericos ou nao positivos caem no padrao: 0 ou negativo
        // deixaria o pool do pg inutilizavel.
        const toPositiveInt = (raw: string, fallback: number): number => {
          const parsed = parseInt(raw, 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
        };
        const poolMax = toPositiveInt(
          config.get<string>('DATABASE_POOL_MAX', '20'),
          20,
        );
        const idleTimeoutMillis = toPositiveInt(
          config.get<string>('DATABASE_POOL_IDLE_TIMEOUT', '30000'),
          30000,
        );
        return {
          type: 'postgres' as const,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.database'),
          autoLoadEntities: true,
          synchronize: false,
          logging: config.get<string>('app.nodeEnv') === 'development',
          extra: {
            max: poolMax,
            idleTimeoutMillis,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
