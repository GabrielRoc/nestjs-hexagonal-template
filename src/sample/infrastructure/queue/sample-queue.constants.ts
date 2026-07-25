/**
 * Nome da fila no Redis. Usado pelo `BullModule.registerQueue`, pelo
 * `@InjectQueue` do adapter e pelo `@Processor` do worker: os tres precisam
 * apontar para a mesma string, entao ela mora em um lugar so.
 *
 * Renomear a fila orfana os jobs ja enfileirados no Redis (eles continuam nas
 * chaves `bull:<nome-antigo>:*` e ninguem mais os consome).
 */
export const SAMPLE_QUEUE_NAME = 'sample';

/**
 * Nome do job dentro da fila. Uma fila pode transportar varios tipos de job;
 * o `process()` do worker decide o que fazer olhando `job.name`.
 */
export const SAMPLE_DEACTIVATE_JOB = 'deactivate-sample';
