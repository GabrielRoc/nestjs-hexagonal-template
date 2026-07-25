import { HttpStatus, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { DeactivateSampleJobData } from '../../domain/ports/sample-queue.port';
import { SampleQueueAdapter } from './sample-queue.adapter';
import { SAMPLE_DEACTIVATE_JOB } from './sample-queue.constants';

const SAMPLE_ID = 'sample-1';
const TENANT_ID = 'tenant-1';

/** Igual ao ENQUEUE_TIMEOUT_MS do adapter. */
const ENQUEUE_TIMEOUT_MS = 3000;

describe('SampleQueueAdapter', () => {
  let queue: jest.Mocked<Pick<Queue<DeactivateSampleJobData>, 'add'>>;
  let adapter: SampleQueueAdapter;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    queue = { add: jest.fn() };
    adapter = new SampleQueueAdapter(
      queue as unknown as Queue<DeactivateSampleJobData>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('enfileira com a politica de retry central e nao lanca no caminho feliz', async () => {
    queue.add.mockResolvedValue({} as Job<DeactivateSampleJobData>);

    await expect(
      adapter.enqueueDeactivation({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
    ).resolves.toBeUndefined();

    // `attempts`/`backoff` moram em uma constante unica: se alguem enfileirar sem
    // a politica, o job passa a nao ter retry nenhum.
    expect(queue.add).toHaveBeenCalledWith(
      SAMPLE_DEACTIVATE_JOB,
      { sampleId: SAMPLE_ID, tenantId: TENANT_ID },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
      }),
    );
  });

  it('traduz Redis fora do ar em 503 em vez de pendurar o request', async () => {
    jest.useFakeTimers();
    // Com o Redis fora, `queue.add` fica esperando a conexao ficar pronta e a
    // promise nunca liquida — o BullMQ reconecta indefinidamente. Sem o timeout
    // do adapter a resposta HTTP nunca sairia.
    queue.add.mockReturnValue(new Promise<never>(() => {}));

    const enqueue = adapter.enqueueDeactivation({
      sampleId: SAMPLE_ID,
      tenantId: TENANT_ID,
    });
    const assertion = expect(enqueue).rejects.toMatchObject({
      code: ErrorCode.QUEUE_UNAVAILABLE,
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    });

    await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);
    await assertion;
  });

  it('nao resolve antes do timeout expirar', async () => {
    jest.useFakeTimers();
    queue.add.mockReturnValue(new Promise<never>(() => {}));

    const settled = jest.fn();
    void adapter
      .enqueueDeactivation({ sampleId: SAMPLE_ID, tenantId: TENANT_ID })
      .catch(settled);

    // O negativo: um timeout curto demais transformaria um Redis apenas lento em
    // 503 e o job nunca seria criado.
    await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
  });

  it('traduz erro do broker em 503 sem vazar a mensagem original', async () => {
    queue.add.mockRejectedValue(new Error('READONLY replica at 10.0.1.7:6379'));

    await expect(
      adapter.enqueueDeactivation({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
    ).rejects.toMatchObject({
      code: ErrorCode.QUEUE_UNAVAILABLE,
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    });

    // A DomainException substitui o erro do ioredis: o filtro global mascara a
    // message de 5xx, mas o code e o status precisam ser os do dominio.
    await expect(
      adapter.enqueueDeactivation({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
