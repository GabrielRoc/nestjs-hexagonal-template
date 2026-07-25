import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';
import { RealtimeIoAdapter } from './realtime-io.adapter';

const ORIGINS = ['https://app.example.com', 'https://admin.example.com'];

describe('RealtimeIoAdapter', () => {
  let createIOServer: jest.SpyInstance;
  let adapter: RealtimeIoAdapter;

  beforeEach(() => {
    createIOServer = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({});
    adapter = new RealtimeIoAdapter({} as INestApplication, ORIGINS);
    jest.spyOn(adapter['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function optionsPassedToSocketIo(): Partial<ServerOptions> {
    const [, options] = createIOServer.mock.calls[0] as [
      number,
      Partial<ServerOptions>,
    ];
    return options;
  }

  function corsPassedToSocketIo() {
    const cors = optionsPassedToSocketIo().cors;
    if (typeof cors !== 'object' || cors === null) {
      throw new Error('cors nao foi configurado como objeto de opcoes');
    }
    return cors;
  }

  function allowRequest(): NonNullable<ServerOptions['allowRequest']> {
    const fn = optionsPassedToSocketIo().allowRequest;
    if (!fn) {
      throw new Error('allowRequest nao foi configurado');
    }
    return fn;
  }

  function handshakeFrom(origin?: string): IncomingMessage {
    return {
      headers: origin === undefined ? {} : { origin },
    } as IncomingMessage;
  }

  it('aplica as origens configuradas e nunca libera qualquer origem', () => {
    adapter.createIOServer(0, {});

    const cors = corsPassedToSocketIo();
    expect(cors).toEqual({ origin: ORIGINS, credentials: true });
    expect(cors.origin).not.toBe(true);
    expect(cors.origin).not.toBe('*');
  });

  it('sobrescreve um cors permissivo declarado no decorator do gateway', () => {
    adapter.createIOServer(0, { cors: { origin: true } });

    expect(corsPassedToSocketIo().origin).toEqual(ORIGINS);
  });

  it('recusa o handshake de uma origem fora da allowlist', () => {
    adapter.createIOServer(0, {});
    const callback = jest.fn();

    allowRequest()(handshakeFrom('https://evil.example.com'), callback);

    expect(callback).toHaveBeenCalledWith(expect.any(String), false);
    expect(callback).not.toHaveBeenCalledWith(null, true);
  });

  it('aceita o handshake de uma origem da allowlist', () => {
    adapter.createIOServer(0, {});
    const callback = jest.fn();

    allowRequest()(handshakeFrom(ORIGINS[1]), callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('aceita handshake sem header Origin (cliente que nao e navegador)', () => {
    adapter.createIOServer(0, {});
    const callback = jest.fn();

    allowRequest()(handshakeFrom(), callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('recusa tudo quando nenhuma origem foi configurada', () => {
    const closedAdapter = new RealtimeIoAdapter({} as INestApplication, []);
    jest
      .spyOn(closedAdapter['logger'], 'warn')
      .mockImplementation(() => undefined);
    closedAdapter.createIOServer(0, {});
    const callback = jest.fn();

    allowRequest()(handshakeFrom('https://app.example.com'), callback);

    expect(callback).toHaveBeenCalledWith(expect.any(String), false);
  });
});
