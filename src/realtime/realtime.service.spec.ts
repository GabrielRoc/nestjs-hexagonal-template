import type { Namespace } from 'socket.io';
import { tenantRoom } from './realtime.constants';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let warn: jest.SpyInstance;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    service = new RealtimeService();
    warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => undefined);
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('nao lanca e avisa quando o servidor ainda nao foi inicializado', () => {
    expect(() =>
      service.emit('tenant-1', 'sample.created', { id: 'x' }),
    ).not.toThrow();

    expect(warn).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emite para a sala do tenant e nao para o namespace inteiro', () => {
    service.setServer({ to } as unknown as Namespace);

    service.emit('tenant-1', 'sample.created', { id: 'x' });

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(tenantRoom('tenant-1'));
    expect(emit).toHaveBeenCalledWith('sample.created', { id: 'x' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('nao entrega o evento de um tenant na sala de outro', () => {
    service.setServer({ to } as unknown as Namespace);

    service.emit('tenant-1', 'sample.created', { id: 'x' });

    expect(to).not.toHaveBeenCalledWith(tenantRoom('tenant-2'));
  });
});
