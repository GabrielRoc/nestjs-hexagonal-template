import { HttpStatus } from '@nestjs/common';
import {
  SAMPLE_ID,
  TENANT_A,
  TENANT_B,
  makeSample,
} from '../../../../test/factories/sample.factory';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { SampleQueuePort } from '../../domain/ports/sample-queue.port';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { ScheduleSampleDeactivationUseCase } from './schedule-sample-deactivation.use-case';

/**
 * O lado produtor da fila testado sem Redis: o use case depende do
 * `SampleQueuePort`, entao o dobro de teste e um objeto com um `jest.fn()`.
 */
describe('ScheduleSampleDeactivationUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findById'>>;
  let queue: jest.Mocked<Pick<SampleQueuePort, 'enqueueDeactivation'>>;
  let useCase: ScheduleSampleDeactivationUseCase;

  beforeEach(() => {
    repo = { findById: jest.fn() };
    queue = { enqueueDeactivation: jest.fn() };
    useCase = new ScheduleSampleDeactivationUseCase(
      repo as unknown as SampleRepositoryPort,
      queue,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enfileira apenas identificadores, nunca a entidade', async () => {
    repo.findById.mockResolvedValue(makeSample({ name: 'Nome sensivel' }));
    queue.enqueueDeactivation.mockResolvedValue(undefined);

    await useCase.execute(SAMPLE_ID, TENANT_A, 5000);

    // O payload fica parado no Redis: um snapshot da entidade chegaria
    // desatualizado no worker e jogaria dado de negocio dentro do broker.
    expect(queue.enqueueDeactivation).toHaveBeenCalledWith(
      { sampleId: SAMPLE_ID, tenantId: TENANT_A },
      5000,
    );
  });

  it('leva o tenantId no job porque o worker roda fora do request', async () => {
    repo.findById.mockResolvedValue(makeSample());
    queue.enqueueDeactivation.mockResolvedValue(undefined);

    await useCase.execute(SAMPLE_ID, TENANT_A);

    const [payload] = queue.enqueueDeactivation.mock.calls[0];
    expect(payload.tenantId).toBe(TENANT_A);
  });

  it('usa delay 0 quando o cliente nao pede atraso', async () => {
    repo.findById.mockResolvedValue(makeSample());
    queue.enqueueDeactivation.mockResolvedValue(undefined);

    await useCase.execute(SAMPLE_ID, TENANT_A);

    expect(queue.enqueueDeactivation).toHaveBeenCalledWith(
      expect.anything(),
      0,
    );
  });

  it('devolve SAMPLE_NOT_FOUND com 404 e nao enfileira nada', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_A)).rejects.toMatchObject({
      code: ErrorCode.SAMPLE_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });
    // Enfileirar antes de validar produziria um job que o worker so descobre ser
    // invalido depois — e o cliente teria recebido 202.
    expect(queue.enqueueDeactivation).not.toHaveBeenCalled();
  });

  it('nao enfileira job para sample de outro tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_B)).rejects.toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
    });
    expect(repo.findById).toHaveBeenCalledWith(SAMPLE_ID, TENANT_B);
    expect(queue.enqueueDeactivation).not.toHaveBeenCalled();
  });

  it('propaga QUEUE_UNAVAILABLE com 503 quando a fila falha', async () => {
    repo.findById.mockResolvedValue(makeSample());
    queue.enqueueDeactivation.mockRejectedValue(
      new DomainException(
        ErrorCode.QUEUE_UNAVAILABLE,
        'Nao foi possivel agendar a operacao. Tente novamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
    );

    // 503 e nao 500: o cliente pode repetir a chamada.
    await expect(useCase.execute(SAMPLE_ID, TENANT_A)).rejects.toMatchObject({
      code: ErrorCode.QUEUE_UNAVAILABLE,
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});
