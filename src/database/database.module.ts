import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const poolMax = parseInt(
          config.get<string>('DATABASE_POOL_MAX', '20'),
          10,
        );
        const idleTimeoutMillis = parseInt(
          config.get<string>('DATABASE_POOL_IDLE_TIMEOUT', '30000'),
          10,
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
            max: isNaN(poolMax) ? 20 : poolMax,
            idleTimeoutMillis: isNaN(idleTimeoutMillis)
              ? 30000
              : idleTimeoutMillis,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
