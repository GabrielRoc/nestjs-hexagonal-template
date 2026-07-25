import type { Namespace } from 'socket.io';
import Session from 'supertokens-node/recipe/session';
import type { SessionContainer } from 'supertokens-node/recipe/session';
import { Role } from '../common/enums/role.enum';
import { User } from '../user/domain/entities/user.entity';
import type { UserRepositoryPort } from '../user/domain/ports/user.repository.port';
import { REALTIME_UNAUTHORIZED_EVENT, tenantRoom } from './realtime.constants';
import { RealtimeGateway, type RealtimeSocket } from './realtime.gateway';
import type { RealtimeService } from './realtime.service';

const COOKIE = 'sAccessToken=abc; sFrontToken=def';

type FakeClient = {
  id: string;
  handshake: { headers: Record<string, string>; url: string };
  data: Record<string, unknown>;
  join: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
};

function createClient(cookie?: string): FakeClient {
  return {
    id: 'socket-1',
    handshake: {
      headers: cookie === undefined ? {} : { cookie },
      url: '/realtime',
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function activeUser(tenantId: string): User {
  return new User({
    id: 'user-1',
    tenantId,
    supertokensUserId: 'st-user-1',
    name: 'Fulano',
    email: 'fulano@example.com',
    role: Role.USER,
  });
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let realtimeService: jest.Mocked<Pick<RealtimeService, 'setServer'>>;
  let userRepository: jest.Mocked<
    Pick<UserRepositoryPort, 'findActiveBySupertokensUserId'>
  >;
  let getSession: jest.SpyInstance;
  let client: FakeClient;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    realtimeService = { setServer: jest.fn() };
    userRepository = { findActiveBySupertokensUserId: jest.fn() };
    gateway = new RealtimeGateway(
      realtimeService as unknown as RealtimeService,
      userRepository as unknown as UserRepositoryPort,
    );
    getSession = jest.spyOn(Session, 'getSession');
    client = createClient(COOKIE);

    logError = jest
      .spyOn(gateway['logger'], 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(gateway['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(gateway['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(gateway['logger'], 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function connect(fake: FakeClient): Promise<void> {
    return gateway.handleConnection(fake as unknown as RealtimeSocket);
  }

  function sessionOf(supertokensUserId: string): SessionContainer {
    return {
      getUserId: () => supertokensUserId,
    } as unknown as SessionContainer;
  }

  /**
   * Erro real do SDK, nao um `new Error(...)` com o nome do tipo no texto: o
   * gateway discrimina via `Session.Error.isErrorFromSuperTokens`, que so
   * reconhece instancias construidas pelo proprio SDK.
   */
  function sessionError(type: string): Error {
    const options = {
      message: `simulated ${type}`,
      type,
      payload: {},
    } as unknown as ConstructorParameters<typeof Session.Error>[0];

    return new Session.Error(options);
  }

  describe('handleConnection', () => {
    it('recusa o handshake sem cookie sem chamar o SuperTokens nem o banco', async () => {
      const rejected = createClient();

      await connect(rejected);

      expect(rejected.disconnect).toHaveBeenCalledWith(true);
      expect(rejected.emit).toHaveBeenCalledWith(REALTIME_UNAUTHORIZED_EVENT, {
        message: 'Sessao invalida ou expirada.',
      });
      expect(rejected.join).not.toHaveBeenCalled();
      expect(getSession).not.toHaveBeenCalled();
      expect(
        userRepository.findActiveBySupertokensUserId,
      ).not.toHaveBeenCalled();
    });

    it('recusa quando o cookie nao carrega sessao valida', async () => {
      getSession.mockResolvedValue(undefined);

      await connect(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(
        userRepository.findActiveBySupertokensUserId,
      ).not.toHaveBeenCalled();
    });

    it('recusa quando a sessao e valida mas o usuario nao esta ativo', async () => {
      getSession.mockResolvedValue(sessionOf('st-user-1'));
      userRepository.findActiveBySupertokensUserId.mockResolvedValue(null);

      await connect(client);

      expect(userRepository.findActiveBySupertokensUserId).toHaveBeenCalledWith(
        'st-user-1',
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it.each([
      Session.Error.TRY_REFRESH_TOKEN,
      Session.Error.UNAUTHORISED,
      Session.Error.INVALID_CLAIMS,
      Session.Error.CLEAR_DUPLICATE_SESSION_COOKIES,
    ])('recusa quando o SuperTokens lanca %s', async (type) => {
      getSession.mockRejectedValue(sessionError(type));

      await connect(client);

      expect(client.emit).toHaveBeenCalledWith(REALTIME_UNAUTHORIZED_EVENT, {
        message: 'Sessao invalida ou expirada.',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      // Sessao expirada/invalida e caso esperado, nao erro de servidor.
      expect(logError).not.toHaveBeenCalled();
    });

    it('nao trata falha do proprio SuperTokens como sessao invalida', async () => {
      // Core do SuperTokens fora do ar, JWKS inacessivel, timeout: erro comum,
      // nao erro tipado do SDK. Se isso virasse "unauthorized", uma indisponi-
      // bilidade do SuperTokens derrubaria a sessao de todos os usuarios.
      getSession.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await connect(client);

      expect(logError).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith(
        REALTIME_UNAUTHORIZED_EVENT,
        expect.anything(),
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('nao trata erro do SuperTokens fora do contrato de sessao como sessao invalida', async () => {
      // TOKEN_THEFT_DETECTED so vem de refreshSession: aparecer aqui significa
      // contrato mudado, e isso tem de ficar visivel em log de erro.
      getSession.mockRejectedValue(
        sessionError(Session.Error.TOKEN_THEFT_DETECTED),
      );

      await connect(client);

      expect(logError).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith(
        REALTIME_UNAUTHORIZED_EVENT,
        expect.anything(),
      );
      expect(client.join).not.toHaveBeenCalled();
    });

    it('coloca o socket apenas na sala do proprio tenant', async () => {
      getSession.mockResolvedValue(sessionOf('st-user-1'));
      userRepository.findActiveBySupertokensUserId.mockResolvedValue(
        activeUser('tenant-9'),
      );

      await connect(client);

      expect(client.join).toHaveBeenCalledTimes(1);
      expect(client.join).toHaveBeenCalledWith(tenantRoom('tenant-9'));
      expect(client.data.tenantId).toBe('tenant-9');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('nao trata falha de infraestrutura como sessao invalida', async () => {
      getSession.mockResolvedValue(sessionOf('st-user-1'));
      userRepository.findActiveBySupertokensUserId.mockRejectedValue(
        new Error('connection refused'),
      );

      await connect(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith(
        REALTIME_UNAUTHORIZED_EVENT,
        expect.anything(),
      );
    });
  });

  describe('afterInit', () => {
    function namespaceWith(allowRequest: unknown): Namespace {
      return {
        server: { engine: { opts: { allowRequest } } },
      } as unknown as Namespace;
    }

    it('entrega o namespace ao RealtimeService', () => {
      const namespace = namespaceWith(() => undefined);

      gateway.afterInit(namespace);

      expect(realtimeService.setServer).toHaveBeenCalledWith(namespace);
      expect(logError).not.toHaveBeenCalled();
    });

    it('grita quando o RealtimeIoAdapter nao foi registrado', () => {
      gateway.afterInit(namespaceWith(undefined));

      expect(logError).toHaveBeenCalled();
    });
  });
});
