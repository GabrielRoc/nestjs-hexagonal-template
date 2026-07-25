import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
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
 * executar. (Um `await` longo nao torna o job *stalled*: o BullMQ renova o lock
 * em um timer proprio, a cada metade do `lockRenewTime`. Quem estoura o lock e
 * bloqueio *sincrono* do event loop ou queda do worker, que impedem o timer de
 * rodar.)
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

  /**
   * OBRIGATORIO em todo processor. O BullMQ sinaliza a falha de uma tentativa
   * apenas com `worker.emit('failed', ...)`; sem nenhum listener o EventEmitter
   * descarta o evento e o pacote nao imprime nada por conta propria. Sem este
   * handler um job que esgota `attempts` some para `bull:<fila>:failed` sem uma
   * unica linha de log — o efeito do job nunca acontece e ninguem descobre.
   *
   * O job vem `undefined` quando um job stalled atinge o limite de stalls e ja
   * foi removido por `removeOnFail`.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<DeactivateSampleJobData> | undefined, error: Error): void {
    // attemptsMade x attempts distingue "vai tentar de novo" de "acabou": so o
    // segundo caso exige acao humana.
    const attempts = job?.opts?.attempts ?? 0;
    const attemptsMade = job?.attemptsMade ?? 0;
    const exhausted = attemptsMade >= attempts;

    this.logger.error(
      `Job ${job?.name ?? 'unknown'} ${job?.id ?? 'unknown'} falhou ` +
        `(tentativa ${attemptsMade}/${attempts}` +
        `${exhausted ? ', sem novas tentativas' : ''}): ${error.message}`,
      error.stack,
    );
  }

  /**
   * OBRIGATORIO em todo processor. Erros internos do worker (conexao Redis
   * recusada, senha errada, script Lua invalido) chegam por 'error'. O BullMQ so
   * repassa o erro de conexao `if (emitter.listenerCount('error') > 0)`, entao
   * sem este handler a falha e completamente silenciosa.
   */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(
      `Worker da fila ${SAMPLE_QUEUE_NAME} reportou erro: ${error.message}`,
      error.stack,
    );
  }
}
