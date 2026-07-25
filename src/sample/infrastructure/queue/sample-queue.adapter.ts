import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type {
  DeactivateSampleJobData,
  SampleQueuePort,
} from '../../domain/ports/sample-queue.port';
import {
  SAMPLE_DEACTIVATE_JOB,
  SAMPLE_QUEUE_NAME,
} from './sample-queue.constants';

/**
 * Politica de retry da fila em um lugar so. Espalhar `attempts`/`backoff` por
 * cada chamada de `add()` faz cada job ganhar uma politica diferente sem
 * ninguem perceber.
 *
 * - `attempts: 3` — o job so vai para "failed" depois de 3 execucoes.
 * - `backoff exponential` com `delay: 30000` — a espera e
 *   `2^(tentativa-1) * delay`, logo 30s e 60s. Com `attempts: 3` existem 2
 *   reagendamentos (a 3a execucao e a ultima), nao 3: a ultima tentativa ocorre
 *   ~90s depois da primeira falha. Dimensione `attempts` a partir da janela que
 *   precisa cobrir. Retry imediato costuma bater no mesmo erro (dependencia
 *   fora do ar) e ainda martela o servico que ja esta sofrendo.
 * - `removeOnComplete`/`removeOnFail` — sem limite o Redis guarda todo job
 *   processado para sempre e a memoria cresce sem teto.
 */
const SAMPLE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: 100,
  removeOnFail: 1000,
};

/**
 * Teto de espera do `add()`. OBRIGATORIO em qualquer adapter de fila: `add()`
 * roda dentro do request e o BullMQ espera a conexao ficar pronta antes de
 * escrever (`Job.create` faz `await queue.client`). Com o Redis fora do ar essa
 * espera nao tem fim util — o `retryStrategy` do proprio BullMQ reconecta para
 * sempre, entao o ioredis nunca emite `end` e a promise nunca rejeita. Sem este
 * timeout a resposta HTTP simplesmente nao sai (o `requestTimeout` do Node cobre
 * so o recebimento do request) e cada chamada deixa um socket preso.
 */
const ENQUEUE_TIMEOUT_MS = 3000;

@Injectable()
export class SampleQueueAdapter implements SampleQueuePort {
  private readonly logger = new Logger(SampleQueueAdapter.name);

  constructor(
    @InjectQueue(SAMPLE_QUEUE_NAME)
    private readonly queue: Queue<DeactivateSampleJobData>,
  ) {}

  async enqueueDeactivation(
    data: DeactivateSampleJobData,
    delayMs = 0,
  ): Promise<void> {
    try {
      await this.withTimeout(
        this.queue.add(SAMPLE_DEACTIVATE_JOB, data, {
          ...SAMPLE_JOB_OPTIONS,
          delay: delayMs,
        }),
      );
    } catch (error) {
      // O detalhe (host, porta, credencial do Redis) fica so no log: o filtro
      // global mascara message/details de qualquer 5xx.
      this.logger.error(
        `Falha ao enfileirar ${SAMPLE_DEACTIVATE_JOB} para o sample ${data.sampleId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new DomainException(
        ErrorCode.QUEUE_UNAVAILABLE,
        'Nao foi possivel agendar a operacao. Tente novamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * `Promise.race` com um timer, e nao `AbortSignal.timeout`: o `add()` do
   * BullMQ nao aceita signal. A promise perdedora continua pendente (o BullMQ
   * escreve o job se o Redis voltar), mas o request ja terminou — e o
   * `Promise.race` mantem um handler nela, entao uma rejeicao tardia nao virou
   * unhandled rejection.
   */
  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error(`Enqueue timed out after ${ENQUEUE_TIMEOUT_MS}ms`)),
        ENQUEUE_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([operation, expiry]);
    } finally {
      // Sem o clear o timer segura o event loop pelo tempo restante mesmo no
      // caminho de sucesso.
      clearTimeout(timer);
    }
  }
}
