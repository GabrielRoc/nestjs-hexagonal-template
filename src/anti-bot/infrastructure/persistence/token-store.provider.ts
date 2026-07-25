import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOKEN_STORE, TokenStore } from '../../domain/ports/token-store.port';
import { InMemoryTokenStore } from './in-memory-token-store';

/**
 * Escolhe o adapter do `TOKEN_STORE`.
 *
 * Hoje existe um so: o de memoria. O template nao tem cliente Redis instalado, e
 * um `import Redis from 'ioredis'` aqui quebraria o build de todo mundo que nao
 * instalou o pacote — nao ha import condicional em tempo de compilacao que valha
 * esse risco num template.
 *
 * O seam esta pronto: `TOKEN_STORE` e um port de UM metodo, e esta factory avisa
 * quem definiu `ANTI_BOT_REDIS_URL` (documentada no `.env.example`) esperando um
 * store compartilhado. O aviso olha SO essa variavel, nunca `REDIS_URL` — quem
 * configura Redis para fila ou cache nao esta pedindo store de form token, e ver
 * um aviso do anti-bot por causa disso e ruido sem acao possivel.
 *
 * Para ligar o adapter compartilhado (a PR de filas e quem traz o Redis):
 *
 * 1. `npm i ioredis`
 * 2. criar `redis-token-store.ts` implementando `TokenStore` com um SET atomico:
 *    `await redis.set(jti, '1', 'PX', ttlMs, 'NX')` — devolve `'OK'` no primeiro
 *    uso e `null` se a chave existia. O `NX` e o que faz o uso unico ser atomico
 *    entre instancias; um `GET` seguido de `SET` tem corrida e aceita o mesmo
 *    token duas vezes em requisicoes concorrentes.
 * 3. devolver esse adapter aqui quando `redisUrl` estiver presente.
 */
export const tokenStoreProvider: Provider = {
  provide: TOKEN_STORE,
  useFactory: (configService: ConfigService): TokenStore => {
    const redisUrl = configService.get<string>('antiBot.redisUrl', '');
    if (redisUrl) {
      new Logger('AntiBotTokenStore').warn(
        'ANTI_BOT_REDIS_URL is set but this build ships no Redis token store; falling back to the in-memory store (single-process single-use only). See src/anti-bot/infrastructure/persistence/token-store.provider.ts.',
      );
    }
    return new InMemoryTokenStore();
  },
  inject: [ConfigService],
};
