import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { DeactivateSampleJobData } from '../../domain/ports/sample-queue.port';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import { SampleDomainService } from '../../domain/services/sample-domain.service';
import { SAMPLE_QUEUE_NAME } from './sample-queue.constants';

/**
 * Worker da fila `sample`. O `@Processor(NOME)` liga a classe a fila e o
 * `@nestjs/bullmq` instancia um `Worker` do BullMQ com este `process()` como
 * callback — por isso o processor e um provider normal do Nest e pode injetar
 * ports igual a um use case.
 *
 * Regras que valem para qualquer worker:
 *
 * - A entrega e *at-least-once*: crash do worker, `stalled job` ou retry fazem
 *   o mesmo job rodar de novo. O `process()` precisa ser idempotente.
 * - Erro lancado = tentativa consumida; o BullMQ reagenda conforme `attempts` e
 *   `backoff` definidos no adapter. Nao capture o erro so para logar: engolir a
 *   excecao marca o job como concluido com sucesso.
 * - Situacao permanente (registro nao existe mais) nao deve lancar erro: retry
 *   nunca vai fazer o registro aparecer, so gera ruido ate estourar `attempts`.
 *
 * ---
 *
 * Backpressure: quando o job NAO pode rodar agora por um motivo temporario
 * (rate limit de um provedor externo, quota diaria, janela de horario
 * comercial), o certo e devolver o job para a fila com atraso em vez de segurar
 * o worker:
 *
 * ```ts
 * import { DelayedError } from 'bullmq';
 *
 * if (!podeRodarAgora) {
 *   await job.moveToDelayed(Date.now() + retryAfterMs, job.token);
 *   throw new DelayedError(); // sinaliza ao BullMQ que o job foi reagendado
 * }
 * ```
 *
 * Por que nao `await sleep(retryAfterMs)`: o worker tem um numero fixo de slots
 * de concorrencia e dormir ocupa um slot inteiro sem fazer nada — com poucos
 * jobs bloqueados a fila inteira para, mesmo havendo trabalho pronto para
 * executar. Alem disso o Redis marca como *stalled* o job cujo lock nao e
 * renovado e o entrega para outro worker, duplicando o processamento.
 *
 * Detalhes que costumam quebrar: `job.token` e obrigatorio (sem ele o
 * `moveToDelayed` falha por lock invalido) e o `DelayedError` precisa subir —
 * o BullMQ o reconhece como "reagendado" e NAO consome uma tentativa de
 * `attempts`, ao contrario de um erro comum. Use `moveToDelayed` para "ainda
 * nao da"; deixe o erro subir para "tentei e falhou".
 */
@Processor(SAMPLE_QUEUE_NAME)
export class SampleProcessor extends WorkerHost {
  private readonly logger = new Logger(SampleProcessor.name);

  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {
    super();
  }

  async process(job: Job<DeactivateSampleJobData>): Promise<void> {
    const { sampleId, tenantId } = job.data;

    const sample = await this.sampleRepo.findById(sampleId, tenantId);
    if (!sample) {
      // Removido entre o enfileiramento e a execucao: nada a fazer e nada a
      // reprocessar.
      this.logger.warn(`Sample ${sampleId} nao encontrado, job ignorado`);
      return;
    }

    if (!SampleDomainService.canDeactivate(sample)) {
      // Idempotencia: em uma reentrega o sample ja esta inativo.
      this.logger.debug(`Sample ${sampleId} ja esta inativo, job ignorado`);
      return;
    }

    sample.isActive = false;
    // Falha aqui (banco fora, deadlock) sobe de proposito: e temporaria e o
    // BullMQ reagenda com o backoff configurado no adapter.
    await this.sampleRepo.update(sample);

    this.logger.log(`Sample ${sampleId} desativado pelo job ${job.name}`);
  }
}
