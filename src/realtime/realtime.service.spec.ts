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

  it('usa uma sala por tenant, sem vazar entre eles', () => {
    service.setServer({ to } as unknown as Namespace);

    service.emit('tenant-1', 'sample.created', { id: 'a' });
    service.emit('tenant-2', 'sample.created', { id: 'b' });

    // Assercoes positivas: se `emit` virar no-op, estas quebram (uma assercao
    // apenas negativa passaria com a implementacao morta).
    expect(to.mock.calls).toEqual([
      [tenantRoom('tenant-1')],
      [tenantRoom('tenant-2')],
    ]);
    expect(emit.mock.calls).toEqual([
      ['sample.created', { id: 'a' }],
      ['sample.created', { id: 'b' }],
    ]);
    expect(tenantRoom('tenant-1')).not.toBe(tenantRoom('tenant-2'));
  });
});
