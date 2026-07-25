import { Sample } from '../entities/sample.entity';

export const SAMPLE_REPOSITORY = Symbol('SAMPLE_REPOSITORY');

/**
 * Contrato de persistencia do modulo. Duas regras que valem para todo port de
 * repositorio do template:
 *
 * 1. **Toda** operacao recebe `tenantId`. Nao existe assinatura sem tenant: e o
 *    que impede um `findById` de virar vazamento entre tenants.
 * 2. Quando o use case precisa de um numero agregado, o port expoe uma primitiva
 *    que devolve o numero (`getMaxSortOrder`) em vez de um `findAll` que o use
 *    case percorre. A conta fica no banco, o use case fica com a regra.
 *
 * O que este port **nao** demonstra, de proposito: checagem de recurso pai
 * (`findById` do pai antes de criar o filho, 404 se o pai nao existe). `Sample` e
 * um recurso raiz — o unico "pai" e o tenant, e a existencia dele ja e garantida
 * pela sessao (`TenantGuard`) e pela FK `samples.tenantId -> app_tenants.id`.
 * Inventar uma entidade pai so para ilustrar o padrao deixaria o modulo de
 * referencia com um conceito que nenhum projeto real herda. Em um modulo com pai
 * de verdade, o use case injeta os dois ports e valida o pai primeiro.
 */
export interface SampleRepositoryPort {
  save(sample: Sample): Promise<Sample>;
  findById(id: string, tenantId: string): Promise<Sample | null>;
  findAll(
    tenantId: string,
    page: number,
    perPage: number,
  ): Promise<[Sample[], number]>;
  /**
   * Maior `sortOrder` vivo do tenant, ou `-1` quando o tenant nao tem nenhum
   * sample. O `-1` faz `max + 1` dar `0` para o primeiro registro sem que o
   * chamador precise de um caso especial.
   */
  getMaxSortOrder(tenantId: string): Promise<number>;
  update(sample: Sample): Promise<Sample>;
  softDelete(id: string, tenantId: string): Promise<void>;
}
