export const SAMPLE_QUEUE = Symbol('SAMPLE_QUEUE');

/**
 * Payload do job. Carregue apenas identificadores: o payload e serializado em
 * JSON e fica parado no Redis ate o worker pegar o job. Um snapshot da entidade
 * chega desatualizado no worker (alguem editou nesse meio tempo) e ainda joga
 * dado de negocio/PII para dentro do Redis.
 */
export interface DeactivateSampleJobData {
  sampleId: string;
  tenantId: string;
}

/**
 * Port de fila do modulo. A camada de aplicacao depende desta interface, nunca
 * do BullMQ: trocar o broker (ou usar um fake nos testes) e trocar o adapter
 * registrado no modulo.
 */
export interface SampleQueuePort {
  enqueueDeactivation(
    data: DeactivateSampleJobData,
    delayMs?: number,
  ): Promise<void>;
}
