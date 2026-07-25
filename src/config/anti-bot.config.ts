import { registerAs } from '@nestjs/config';

/**
 * `parseInt` devolve NaN em entrada invalida, e NaN desliga a comparacao em
 * silencio: `elapsed < NaN` e sempre falso, ou seja um `ANTI_BOT_MIN_TIME_MS=abc`
 * desativaria o TimingGuard sem nenhum sinal. Entrada invalida cai no default.
 */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const antiBotConfig = registerAs('antiBot', () => ({
  /**
   * Chave HMAC dos form tokens. Vazio = nao configurado; o FormTokenService gera
   * uma chave aleatoria por processo e registra o aviso (ver comentario lá).
   * Nunca coloque um default fixo aqui: um segredo publicado no repositorio
   * permite a qualquer um forjar form tokens validos em producao.
   */
  tokenSecret: (process.env.ANTI_BOT_TOKEN_SECRET ?? '').trim(),

  /** Tempo minimo entre a renderizacao do formulario e o submit. */
  minTimeMs: parsePositiveInt(process.env.ANTI_BOT_MIN_TIME_MS, 2_000),

  /**
   * Idade maxima do formulario. Vale para os DOIS lados da mesma janela: o
   * `exp` do form token emitido e o limite do TimingGuard. Um valor só evita
   * que os dois divirjam (token ainda valido com formulario "expirado").
   */
  maxTimeMs: parsePositiveInt(process.env.ANTI_BOT_MAX_TIME_MS, 1_800_000),

  turnstileEnabled: process.env.TURNSTILE_ENABLED === 'true',
  turnstileSiteKey: (process.env.TURNSTILE_SITE_KEY ?? '').trim(),
  turnstileSecretKey: (process.env.TURNSTILE_SECRET_KEY ?? '').trim(),

  /**
   * Turnstile inacessivel: `true` libera a requisicao (site continua de pe numa
   * queda da Cloudflare, mas quem consegue bloquear a chamada de verificacao
   * burla o captcha), `false` rejeita. Default `true` — indisponibilidade de um
   * terceiro nao deveria derrubar o cadastro do site inteiro.
   */
  turnstileFailOpen: process.env.TURNSTILE_FAIL_OPEN !== 'false',

  /**
   * Presenca de configuracao de Redis PARA O ANTI-BOT. Este template NAO traz
   * adapter Redis (nao ha cliente instalado); a variavel existe para avisar quem
   * a definiu esperando um store de form tokens compartilhado entre instancias.
   * Ver token-store.provider.ts, que tem o passo a passo do adapter.
   *
   * Le SO `ANTI_BOT_REDIS_URL`, sem fallback para `REDIS_URL`: essa outra
   * variavel pertence a quem usa Redis para fila ou cache, e quem a define para
   * uma fila nao esta pedindo store de form token. Com o fallback, esses projetos
   * imprimiam o aviso do anti-bot em TODO boot — mesmo sem nenhuma rota
   * `@AntiBot()` — e nao havia nem como descobrir de onde vinha.
   */
  redisUrl: (process.env.ANTI_BOT_REDIS_URL ?? '').trim().replace(/\/+$/, ''),
}));
