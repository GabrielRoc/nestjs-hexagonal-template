import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Sample } from '../../domain/entities/sample.entity';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import type { DeactivateSampleJobData } from '../../domain/ports/sample-queue.port';
import { SAMPLE_DEACTIVATE_JOB } from './sample-queue.constants';
import { SampleProcessor } from './sample.processor';

const SAMPLE_ID = 'sample-1';
const TENANT_ID = 'tenant-1';

function createJob(
  data: DeactivateSampleJobData,
): Job<DeactivateSampleJobData> {
  return {
    name: SAMPLE_DEACTIVATE_JOB,
    data,
  } as unknown as Job<DeactivateSampleJobData>;
}

/**
 * Nomes de evento declarados por `@OnWorkerEvent` no metodo. A chave de metadata
 * do `@nestjs/bullmq` nao e exportada pelo pacote, entao a leitura e feita pelo
 * formato do valor (`{ eventName }`) — o que sobrevive a uma troca da chave.
 */
function declaredWorkerEvents(method: unknown): string[] {
  return Reflect.getMetadataKeys(method as object)
    .map((key: string) => Reflect.getMetadata(key, method as object) as unknown)
    .filter(
      (value): value is { eventName: string } =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { eventName?: unknown }).eventName === 'string',
    )
    .map((value) => value.eventName);
}

function createSample(overrides?: { isActive?: boolean }): Sample {
  return new Sample({
    id: SAMPLE_ID,
    tenantId: TENANT_ID,
    name: 'Sample',
    isActive: overrides?.isActive ?? true,
  });
}

describe('SampleProcessor', () => {
  let processor: SampleProcessor;
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findById' | 'update'>>;

  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    // O processor tem um Logger proprio: sem os spies cada teste sujaria a
    // saida do jest com as linhas de log do worker.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    repo = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    processor = new SampleProcessor(repo as unknown as SampleRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('desativa o sample e persiste a mudanca', async () => {
    const sample = createSample();
    repo.findById.mockResolvedValue(sample);
    repo.update.mockResolvedValue(sample);

    await processor.process(
      createJob({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
    );

    expect(sample.isActive).toBe(false);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(sample);
  });

  it('busca o sample com o tenantId do payload, nao com o do registro', async () => {
    // O worker roda fora do request: nao ha TenantContextMiddleware para
    // preencher o tenant. Se o processor esquecer de repassar o tenantId do job,
    // a query passa a enxergar registro de outro tenant.
    repo.findById.mockResolvedValue(null);

    await processor.process(
      createJob({ sampleId: SAMPLE_ID, tenantId: 'tenant-outro' }),
    );

    expect(repo.findById).toHaveBeenCalledWith(SAMPLE_ID, 'tenant-outro');
  });

  it('ignora o job quando o sample nao existe mais, sem consumir tentativa', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      processor.process(
        createJob({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
      ),
    ).resolves.toBeUndefined();

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('e idempotente: reentrega de job em sample ja inativo nao regrava', async () => {
    // Entrega at-least-once: crash do worker ou job stalled fazem o mesmo job
    // rodar de novo.
    repo.findById.mockResolvedValue(createSample({ isActive: false }));

    await processor.process(
      createJob({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
    );

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('propaga falha de persistencia para o BullMQ reagendar', async () => {
    // Engolir o erro aqui marcaria o job como concluido com sucesso e o sample
    // ficaria ativo para sempre.
    const sample = createSample();
    repo.findById.mockResolvedValue(sample);
    repo.update.mockRejectedValue(new Error('connection terminated'));

    await expect(
      processor.process(
        createJob({ sampleId: SAMPLE_ID, tenantId: TENANT_ID }),
      ),
    ).rejects.toThrow('connection terminated');
  });

  describe('listeners de evento do worker', () => {
    it('registra os handlers de "failed" e "error" via @OnWorkerEvent', () => {
      // Sem o decorator o metodo continua existindo e os testes de log abaixo
      // passariam, mas o @nestjs/bullmq nunca ligaria o handler ao worker: a
      // falha voltaria a ser silenciosa em producao.
      expect(declaredWorkerEvents(processor.onFailed)).toContain('failed');
      expect(declaredWorkerEvents(processor.onError)).toContain('error');
    });

    it('loga a falha do job com id e contagem de tentativas', () => {
      const job = {
        id: 'job-42',
        name: SAMPLE_DEACTIVATE_JOB,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<DeactivateSampleJobData>;

      processor.onFailed(job, new Error('connection terminated'));

      expect(loggerError).toHaveBeenCalledTimes(1);
      const [message] = loggerError.mock.calls[0] as [string];
      // Sem o id e a contagem a linha nao permite achar o job em
      // `bull:sample:failed` nem saber se ainda havera retry.
      expect(message).toContain('job-42');
      expect(message).toContain('3/3');
    });

    it('loga a falha mesmo quando o job ja foi removido pelo removeOnFail', () => {
      // O BullMQ emite 'failed' com job undefined quando um job stalled estoura o
      // limite de stalls e ja foi removido: um acesso direto a job.id derrubaria
      // o proprio listener de erro.
      expect(() =>
        processor.onFailed(
          undefined,
          new Error('job stalled more than allowed'),
        ),
      ).not.toThrow();

      expect(loggerError).toHaveBeenCalledTimes(1);
    });

    it('loga erro interno/conexao do worker', () => {
      processor.onError(new Error('WRONGPASS invalid username-password pair'));

      expect(loggerError).toHaveBeenCalledTimes(1);
    });
  });
});
