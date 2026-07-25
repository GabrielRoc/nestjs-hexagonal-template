import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Conexao compartilhada do BullMQ (Redis). Cada modulo que precisa de fila
 * registra a sua com `BullModule.registerQueue({ name })` e herda esta conexao.
 *
 * Shutdown: o `@nestjs/bullmq` fecha workers e queues sozinho no
 * `onApplicationShutdown` (BullExplorer fecha os workers, cada provider de Queue
 * fecha a propria conexao). Como `main.ts` chama `app.enableShutdownHooks()`,
 * nao e preciso nenhum `OnModuleDestroy` aqui.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string | undefined>('redis.password'),
          // `maxRetriesPerRequest` NAO e declarado aqui de proposito. Esta
          // conexao e herdada pelo Worker (bloqueante) e pela Queue (produtor), e
          // os dois querem valores opostos:
          //
          // - Worker: precisa de `null`, porque os comandos bloqueantes
          //   (BZPOPMIN) ficam parados esperando job e estourariam
          //   MaxRetriesPerRequestError. O proprio BullMQ forca `null` na conexao
          //   bloqueante (`RedisConnection`: `if (blocking)
          //   opts.maxRetriesPerRequest = null`), entao nao ha nada a fazer.
          // - Produtor: com `null` o ioredis nunca rejeita o comando parado na
          //   offline queue e o `queue.add()` fica pendurado no request enquanto
          //   o Redis estiver fora. Omitindo a chave ele mantem o padrao finito
          //   do ioredis e o comando termina em erro.
          //
          // O WARNING do BullMQ ("maxRetriesPerRequest must be null") so aparece
          // quando a chave e passada com valor truthy; omitir nao gera ruido.
          // A garantia de que o request nao trava e o timeout explicito do
          // adapter (ver sample-queue.adapter.ts), nao este valor.
        },
      }),
    }),
  ],
})
export class QueueModule {}
