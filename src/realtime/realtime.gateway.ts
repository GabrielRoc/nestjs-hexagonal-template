import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import Session from 'supertokens-node/recipe/session';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../user/domain/ports/user.repository.port';
import {
  REALTIME_NAMESPACE,
  REALTIME_UNAUTHORIZED_EVENT,
  tenantRoom,
} from './realtime.constants';
import { RealtimeService } from './realtime.service';

/**
 * Tipos de erro com que o supertokens-node diz "esta sessao nao vale". Sao os
 * UNICOS que podem ser tratados como "nao ha sessao": qualquer outro erro do
 * `getSession` (core do SuperTokens fora do ar, JWKS inacessivel, timeout,
 * contrato do SDK mudado nos shims) e falha de infraestrutura e tem de subir.
 *
 * `TOKEN_THEFT_DETECTED` esta fora de proposito: so `refreshSession` o lanca
 * (`sessionFunctions.js`), entao aparecer aqui significa que algo saiu do
 * contrato e queremos o log de erro, nao um "unauthorized" silencioso.
 */
const INVALID_SESSION_ERROR_TYPES: readonly string[] = [
  Session.Error.UNAUTHORISED,
  Session.Error.TRY_REFRESH_TOKEN,
  Session.Error.INVALID_CLAIMS,
  Session.Error.CLEAR_DUPLICATE_SESSION_COOKIES,
];

/**
 * Devolve o tipo do erro quando ele significa "sessao invalida", ou null quando
 * o erro e de outra natureza (e portanto precisa ser propagado).
 */
function invalidSessionErrorType(error: unknown): string | null {
  if (!Session.Error.isErrorFromSuperTokens(error)) {
    return null;
  }

  return INVALID_SESSION_ERROR_TYPES.includes(error.type) ? error.type : null;
}

/** Dados anexados ao socket depois de o handshake ser autenticado. */
export interface RealtimeSocketData {
  tenantId: string;
}

export type RealtimeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  RealtimeSocketData
>;

/**
 * `Session.getSession` espera o par req/res do framework configurado
 * (`framework: 'express'`, ver `auth.module.ts`). Num upgrade de WebSocket esse
 * par nao existe mais no formato que o SDK espera, entao montamos o minimo que
 * os caminhos de codigo realmente exercitados precisam.
 *
 * Request: o handshake de WebSocket E uma requisicao HTTP GET, logo os headers
 * do upgrade sao headers HTTP de verdade e podem ser repassados como estao.
 * Usamos `client.handshake` (o snapshot que o socket.io guarda) e nao
 * `client.request`, que e a IncomingMessage viva do upgrade.
 *
 * Note o que NAO esta aqui: `cookies`. O SDK
 * (`getCookieValueFromIncomingMessage`) usa `req.cookies[key]` quando o campo
 * existe e so cai no parse do header `cookie` quando ele falta. Deixar o SDK
 * parsear com o pacote `cookie` (que faz `decodeURIComponent`) e mais correto
 * que um parser artesanal, que erraria qualquer valor percent-encoded — e o
 * token de sessao e percent-encoded ao ser gravado.
 */
function createSessionRequestShim(client: RealtimeSocket) {
  return {
    headers: client.handshake.headers,
    // Lido pelo SDK apenas quando `antiCsrfCheck` nao e informado (ele so faz o
    // check em metodos != GET). Passamos por honestidade: um handshake e um GET.
    method: 'GET',
    url: client.handshake.url,
  };
}

/**
 * Response shim. Quando `handleConnection` roda, a resposta HTTP 101 do upgrade
 * JA foi enviada: nao ha mais como gravar header nem corpo. Todo metodo aqui
 * existe por causa de um caminho concreto do supertokens-node, e todos sao
 * inertes de proposito.
 */
function createSessionResponseShim() {
  const res = {
    // `setHeaderForExpressLikeResponse` comeca com `res.getHeaders()` para
    // decidir se sobrescreve ou concatena. Sem este metodo a chamada estoura
    // dentro do try/catch do SDK, que converte a falha em
    // "Error while setting header ..." — e uma sessao VALIDA seria recusada.
    // `{}` significa "nenhum header definido ainda".
    getHeaders: (): Record<string, string> => ({}),

    // `appendToServerResponse` (usado ao gravar Set-Cookie) le o valor atual
    // antes de sobrescrever. Nao ha resposta para ler.
    getHeader: (): string | undefined => undefined,

    // `getSession` chama `session.attachToRequestResponse`, que grava
    // `front-token`, `Access-Control-Expose-Headers` e, na rotacao do access
    // token, Set-Cookie. Nada disso alcanca o cliente num socket ja "upgraded",
    // entao engolimos: o cliente renova a sessao pelas rotas HTTP normais.
    setHeader: (): void => {},
    removeHeader: (): void => {},

    // O SDK prefere `res.header()` quando existe (compatibilidade com Next.js)
    // e encadeia o retorno, por isso devolvemos o proprio shim.
    header: (): unknown => res,

    // `sendJSONResponse`/`sendHTMLResponse` checam `writableEnded` antes de
    // escrever. Marcando a resposta como finalizada, qualquer tentativa do SDK
    // de responder (handler de erro, por exemplo) vira no-op em vez de estourar.
    writableEnded: true,
    status: (): unknown => res,
    json: (): void => {},
    send: (): void => {},
  };

  return res;
}

/**
 * Namespace Socket.io autenticado e isolado por tenant.
 *
 * CORS/Origin: NAO declare `cors` neste decorator. O decorator e avaliado no
 * carregamento da classe, sem acesso a `ConfigService`, e foi exatamente por
 * isso que a origem virava `origin: true` (qualquer origem). A allowlist real
 * e aplicada pelo `RealtimeIoAdapter`, registrado em `main.ts`.
 *
 * ATENCAO — a autenticacao e verificada SO no handshake. Depois que o socket
 * entra na sala do tenant nao ha revalidacao: revogar a sessao no SuperTokens
 * (logout) ou desativar/remover o usuario NAO derruba um socket ja aberto, que
 * segue recebendo os eventos do tenant enquanto a conexao TCP viver. O caminho
 * HTTP, esse sim, bloqueia na requisicao seguinte.
 *
 * Isso e deliberado, e nao um esquecimento: `client.handshake.headers` e um
 * snapshot congelado no upgrade, entao revalidar chamando `getSession` de novo
 * derrubaria todo socket saudavel quando o access token daquele snapshot
 * expirasse (1h no default do SuperTokens), mesmo com o usuario ativo e
 * renovando a sessao pelas rotas HTTP. Se a janela de exposicao for inaceitavel
 * no seu projeto, as duas saidas reais sao: (a) revalidar periodicamente apenas
 * a parte de banco — guardar o `supertokensUserId` em `client.data` e reexecutar
 * `findActiveBySupertokensUserId` num intervalo, desconectando quem nao resolver
 * mais (custo: uma query por socket por ciclo); ou (b) desconectar de forma
 * dirigida quando o usuario e desativado, expondo no `RealtimeService` um
 * `disconnect(tenantId, ...)` chamado pelo use case correspondente.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtimeService: RealtimeService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
  ) {}

  afterInit(namespace: Namespace): void {
    this.realtimeService.setServer(namespace);

    // Guarda de configuracao: `allowRequest` so existe se o RealtimeIoAdapter
    // foi registrado. Quem escrever um bootstrap proprio e esquecer o adapter
    // ficaria com o handshake aceitando qualquer Origin em silencio — falhar
    // alto aqui e o unico jeito de essa omissao aparecer.
    if (!namespace.server?.engine?.opts?.allowRequest) {
      this.logger.error(
        'RealtimeIoAdapter is not registered: the WebSocket handshake is NOT ' +
          'validating the Origin header. Add ' +
          'app.useWebSocketAdapter(new RealtimeIoAdapter(app, corsOrigins)) to the bootstrap.',
      );
    }

    this.logger.log(`WebSocket namespace ${REALTIME_NAMESPACE} initialized`);
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    try {
      const tenantId = await this.resolveClientTenantId(client);

      if (!tenantId) {
        this.logger.warn(
          `WebSocket connection rejected: no valid session (${client.id})`,
        );
        client.emit(REALTIME_UNAUTHORIZED_EVENT, {
          message: 'Sessao invalida ou expirada.',
        });
        client.disconnect(true);
        return;
      }

      client.data.tenantId = tenantId;
      await client.join(tenantRoom(tenantId));
      this.logger.log(
        `Client ${client.id} joined room ${tenantRoom(tenantId)}`,
      );
    } catch (error) {
      // Chega aqui o que NAO e "sessao invalida": banco fora, port quebrado,
      // core do SuperTokens/JWKS inacessivel. Nada disso pode ser confundido com
      // falha de autenticacao — por isso o repo e consultado fora do try/catch
      // de `getSession` e o proprio `getSession` so trata como "sem sessao" os
      // tipos de erro de INVALID_SESSION_ERROR_TYPES, propagando o resto.
      // O cliente e desconectado sem `unauthorized`: o front deve reconectar com
      // backoff, nao derrubar a sessao do usuario.
      this.logger.error(
        `WebSocket connection error (${client.id}): ${describeError(error)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: RealtimeSocket): void {
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  private async resolveClientTenantId(
    client: RealtimeSocket,
  ): Promise<string | null> {
    const supertokensUserId = await this.resolveSupertokensUserId(client);
    if (!supertokensUserId) {
      return null;
    }

    const user =
      await this.userRepository.findActiveBySupertokensUserId(
        supertokensUserId,
      );

    if (!user) {
      // Sessao valida no SuperTokens mas sem usuario ativo correspondente:
      // usuario desativado ou removido depois de o token ser emitido.
      this.logger.debug(
        `No active user for SuperTokens ID ${supertokensUserId} (client ${client.id})`,
      );
      return null;
    }

    return user.tenantId;
  }

  private async resolveSupertokensUserId(
    client: RealtimeSocket,
  ): Promise<string | null> {
    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) {
      // Sem cookie nao ha o que verificar: a sessao viaja em cookie
      // (sAccessToken). Evita uma ida inutil ao core do SuperTokens.
      this.logger.debug(`No cookie in handshake (client ${client.id})`);
      return null;
    }

    try {
      const session = await Session.getSession(
        createSessionRequestShim(client),
        createSessionResponseShim(),
        // sessionRequired: false => devolve undefined em vez de lancar quando
        // nao ha sessao. antiCsrfCheck: false => nao existe token anti-CSRF num
        // handshake; a defesa contra cross-site WebSocket hijacking e a
        // allowlist de Origin do RealtimeIoAdapter, que o navegador nao burla.
        { sessionRequired: false, antiCsrfCheck: false },
      );

      if (!session) {
        this.logger.debug(`No session for client ${client.id}`);
        return null;
      }

      return session.getUserId();
    } catch (error) {
      const invalidSessionType = invalidSessionErrorType(error);

      if (invalidSessionType === null) {
        // Engolir aqui seria o pior resultado possivel: com o core do
        // SuperTokens fora do ar, TODO handshake — inclusive de cookie valido —
        // viraria "sessao invalida", o front derrubaria a sessao do usuario e o
        // log ficaria identico ao de um token expirado de rotina. Sobe para o
        // catch de `handleConnection`, que loga em `error` e nao emite
        // `unauthorized`.
        throw error;
      }

      // Token expirado (TRY_REFRESH_TOKEN) e token invalido (UNAUTHORISED) vem
      // como excecao mesmo com sessionRequired: false. `warn` e nao `debug`
      // porque `debug` e descartado com LOG_LEVEL=info, o default em producao
      // (ver logger.service.ts): sem o motivo neste nivel nao ha como saber por
      // que os handshakes estao sendo recusados.
      this.logger.warn(
        `Session validation failed (client ${client.id}): ` +
          `${invalidSessionType} (${describeError(error)})`,
      );
      return null;
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
