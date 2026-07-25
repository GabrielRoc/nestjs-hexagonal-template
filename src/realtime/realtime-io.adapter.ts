import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { Server, ServerOptions } from 'socket.io';

type AllowRequestCallback = (
  error: string | null | undefined,
  allowed: boolean,
) => void;

/**
 * Adapter que aplica no handshake do Socket.io a MESMA allowlist de origens que
 * o CORS HTTP usa (`app.corsOrigins`, vindo de `CORS_ORIGINS`).
 *
 * Por que um adapter e nao o decorator: `@WebSocketGateway({ cors: ... })` e
 * avaliado quando a classe e carregada, antes de o container existir — nao ha
 * como ler `ConfigService` de dentro dele. O ponto de extensao que o Nest
 * oferece para configurar o servidor de WebSocket com dependencias resolvidas e
 * `app.useWebSocketAdapter()`, que roda depois do bootstrap (ver `main.ts`).
 *
 * Sao duas travas, porque uma so nao resolve:
 *
 * 1. `cors` — vale para o transporte `polling` (requisicoes XHR de verdade,
 *    sujeitas a CORS). Sem os headers de resposta corretos o navegador bloqueia
 *    a conexao de origens fora da lista.
 * 2. `allowRequest` — vale para o transporte `websocket`. Navegador NAO aplica
 *    CORS a um upgrade de WebSocket: uma pagina maliciosa consegue abrir
 *    `new WebSocket(...)` para a nossa API e, num setup cross-site (cookie
 *    `SameSite=None`, que e o que o SuperTokens usa quando apiDomain e
 *    websiteDomain diferem), o cookie de sessao VAI junto. Isso e
 *    cross-site WebSocket hijacking, e `cors` nao impede — quem impede e
 *    recusar o upgrade no servidor. O engine.io chama `allowRequest` tanto no
 *    `handleRequest` (polling) quanto no `handleUpgrade` (websocket), antes de
 *    a conexao existir.
 */
export class RealtimeIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RealtimeIoAdapter.name);
  private readonly allowedOrigins: readonly string[];

  constructor(app: INestApplication, corsOrigins: readonly string[]) {
    super(app);
    this.allowedOrigins = [...corsOrigins];
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    // O spread vem primeiro de proposito: `cors` e `allowRequest` sobrescrevem
    // qualquer coisa declarada no decorator do gateway, para que nao exista um
    // segundo lugar capaz de afrouxar a politica de origem.
    const hardenedOptions: Partial<ServerOptions> = {
      ...options,
      // O default do socket.io e `serveClient: true`, e com ele o
      // `attachServe()` faz `removeAllListeners('request')` no servidor HTTP e
      // instala o proprio handler para `/socket.io/socket.io*.js(.map)`. Essas
      // requisicoes NAO passam pelo Express: sem headers do helmet, sem
      // ThrottlerGuard, sem autenticacao, e com o ETag sendo a versao exata do
      // socket.io (mais o source map). O cliente vem do bundle do front
      // (`socket.io-client`), o backend nao precisa servir nada disso.
      serveClient: false,
      cors: {
        origin: [...this.allowedOrigins],
        // O cliente conecta com `withCredentials: true` para o cookie de sessao
        // do SuperTokens viajar no handshake.
        credentials: true,
      },
      allowRequest: (req: IncomingMessage, callback: AllowRequestCallback) => {
        this.checkOrigin(req, callback);
      },
    };

    if (this.allowedOrigins.length === 0) {
      this.logger.warn(
        'No CORS origins configured: every cross-origin WebSocket handshake will be refused',
      );
    } else {
      this.logger.log(
        `WebSocket handshake restricted to origins: ${this.allowedOrigins.join(', ')}`,
      );
    }

    return super.createIOServer(port, hardenedOptions) as Server;
  }

  private checkOrigin(
    req: IncomingMessage,
    callback: AllowRequestCallback,
  ): void {
    const origin = req.headers.origin;

    // Requisicao sem `Origin` e cliente que nao e navegador (app mobile,
    // servico interno, teste de integracao). Navegador SEMPRE envia `Origin`
    // num handshake de WebSocket e uma pagina nao consegue falsificar o header,
    // entao liberar o caso sem origem nao reabre o hijacking cross-site.
    if (origin === undefined || this.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    this.logger.warn(
      `WebSocket handshake refused: origin "${origin}" is not in CORS_ORIGINS`,
    );
    callback('origin_not_allowed', false);
  }
}
