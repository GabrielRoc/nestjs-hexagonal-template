import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import {
  SAMPLE_QUEUE,
  type SampleQueuePort,
} from '../../domain/ports/sample-queue.port';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';

/**
 * Lado produtor da fila: o use case valida o que da para validar de forma
 * sincrona (o sample existe e pertence ao tenant) e delega o trabalho ao port
 * de fila. Ele nao conhece BullMQ nem Redis.
 */
@Injectable()
export class ScheduleSampleDeactivationUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
    @Inject(SAMPLE_QUEUE)
    private readonly sampleQueue: SampleQueuePort,
  ) {}

  async execute(id: string, tenantId: string, delayMs = 0): Promise<void> {
    const sample = await this.sampleRepo.findById(id, tenantId);
    if (!sample) {
      throw new DomainException(
        ErrorCode.SAMPLE_NOT_FOUND,
        'Sample não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    // O job leva tenantId: o worker roda fora do request e nao tem o
    // TenantContextMiddleware para dizer de quem e o registro.
    await this.sampleQueue.enqueueDeactivation(
      { sampleId: sample.id, tenantId },
      delayMs,
    );
  }
}
