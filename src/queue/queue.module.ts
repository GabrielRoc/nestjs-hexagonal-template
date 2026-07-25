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
          // OBRIGATORIO: o worker do BullMQ usa comandos bloqueantes (BZPOPMIN)
          // que ficam parados esperando job. Com o padrao do ioredis (20) o
          // comando estoura MaxRetriesPerRequestError e o BullMQ derruba o
          // worker com erros confusos de conexao. O proprio BullMQ sobrescreve
          // o valor para null nas conexoes bloqueantes, mas antes disso loga
          // "WARNING! Your redis options maxRetriesPerRequest must be null" em
          // console.error; declarar aqui evita o ruido e deixa a regra visivel.
          // Efeito colateral no lado produtor: com null o `queue.add()` espera
          // a reconexao em vez de falhar rapido quando o Redis esta fora.
          maxRetriesPerRequest: null,
        },
      }),
    }),
  ],
})
export class QueueModule {}
