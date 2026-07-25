import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Mensagem generica devolvida ao cliente; o motivo real vai para o log. */
const UNAVAILABLE_MESSAGE = 'Redis indisponível';

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator
  implements OnModuleDestroy
{
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    super();
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string | undefined>('redis.password'),
      // Cliente proprio do health check, separado do pool do BullMQ: um PING
      // preso aqui nao pode roubar conexao de quem processa job.
      lazyConnect: true,
      // connectTimeout limita SO o handshake TCP. Se o servidor (ou um LB no
      // meio) aceita a conexao e nunca responde, o PING fica pendurado para
      // sempre — mesmo problema que o s3.health-indicator ja teve. Por isso o
      // commandTimeout: o ioredis arma o timer no envio do comando, inclusive
      // enquanto ele espera na offline queue, entao ele cobre tambem o caso de
      // Redis fora do ar. GET /api/health e publico e nao pode ficar pendurado.
      connectTimeout: 2000,
      commandTimeout: 2000,
      // Sem isso o ioredis reenfileira o comando por ate 20 reconexoes antes de
      // desistir. 1 basta: o proximo health check tenta de novo.
      maxRetriesPerRequest: 1,
    });

    // Sem listener de 'error' o ioredis nao fica calado: o `silentEmit` cai em
    // `console.error('[ioredis] Unhandled error event:', error.stack)` a cada
    // tentativa de reconexao, fora do formato JSON do AppLoggerService. Este
    // handler existe para trazer a falha para o logger da app (nivel debug, o
    // sinal que importa e o status do health check).
    this.client.on('error', (error: Error) => {
      this.logger.debug(`Redis connection error: ${error.message}`);
    });
  }

  onModuleDestroy(): void {
    // Este cliente e criado no construtor e nao pertence ao pool do BullMQ, entao
    // ninguem mais o fecha. No shutdown por sinal o processo morre de qualquer
    // forma (o Nest re-emite o sinal com process.kill apos app.close()), mas em
    // `Test.createTestingModule` + `await app.close()` — o cenario documentado em
    // test/app.e2e-spec.ts — o socket ocioso fica pendurado e o jest nao encerra.
    this.client.disconnect();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // O ioredis declara o retorno como o literal 'PONG'; o que chega de fato
      // e o que o servidor respondeu. Widening para string mantem a checagem de
      // runtime viva (um proxy/porta errada responde outra coisa) — sem isso o
      // TypeScript estreita o ramo de erro para `never`.
      const result: string = await this.client.ping();
      if (result !== 'PONG') {
        throw new Error(`Unexpected PING response: ${result}`);
      }
      return this.getStatus(key, true);
    } catch (error) {
      // GET /api/health e publico: a resposta nunca pode descrever a infra
      // (host, porta, credencial). O detalhe fica so no log do servidor.
      this.logger.error(
        `Redis health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { message: UNAVAILABLE_MESSAGE }),
      );
    }
  }
}
