import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
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
 * - `backoff exponential` com `delay: 30000` — 30s, 60s, 120s entre as
 *   tentativas. Retry imediato costuma bater no mesmo erro (dependencia fora do
 *   ar) e ainda martela o servico que ja esta sofrendo.
 * - `removeOnComplete`/`removeOnFail` — sem limite o Redis guarda todo job
 *   processado para sempre e a memoria cresce sem teto.
 */
const SAMPLE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: 100,
  removeOnFail: 1000,
};

@Injectable()
export class SampleQueueAdapter implements SampleQueuePort {
  constructor(
    @InjectQueue(SAMPLE_QUEUE_NAME)
    private readonly queue: Queue<DeactivateSampleJobData>,
  ) {}

  async enqueueDeactivation(
    data: DeactivateSampleJobData,
    delayMs = 0,
  ): Promise<void> {
    await this.queue.add(SAMPLE_DEACTIVATE_JOB, data, {
      ...SAMPLE_JOB_OPTIONS,
      delay: delayMs,
    });
  }
}
