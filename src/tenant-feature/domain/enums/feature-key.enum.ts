/**
 * Vocabulario de feature flags do projeto.
 *
 * Chega VAZIO de proposito: as features sao do dominio de quem clona o
 * template, nao do template. Preencha com as chaves do seu projeto:
 *
 *   export enum FeatureKey {
 *     // EXPORT = 'EXPORT',
 *     // ADVANCED_REPORTS = 'ADVANCED_REPORTS',
 *   }
 *
 * Consequencias reais do enum vazio (verificadas com `tsc --strict`, nao
 * supostas) e por que as camadas abaixo trafegam `FeatureKeyValue` em vez de
 * `FeatureKey`:
 *
 * 1. O tipo `FeatureKey` de um enum vazio nao e habitado por nenhum valor e
 *    nao e atribuivel a `string`. `const s: string = entity.featureKey` falha
 *    com TS2322 e `entity.featureKey as FeatureKey` (a partir de `string`)
 *    falha com TS2352 — exatamente o que o repositorio e o mapper precisariam
 *    fazer. Por isso entidade, port, cache e DTO usam `FeatureKeyValue`.
 * 2. `Object.values(FeatureKey)` devolve `[]`, entao qualquer schema Zod
 *    construido a partir do enum rejeitaria toda entrada. Ver o fallback
 *    documentado em `featureKeySchema` (application/dtos).
 *
 * O enum permanece a superficie de AUTORIA: `@RequiresFeature()` recebe
 * `FeatureKey`, ou seja, enquanto ele estiver vazio nenhuma rota consegue ser
 * marcada — o comportamento correto para um projeto que ainda nao declarou
 * features. Ao preencher o enum, as chamadas passam a ser type-checked.
 */
export enum FeatureKey {
  // EXAMPLE = 'EXAMPLE',
}

/**
 * Forma serializada de uma feature key: e o que atravessa banco, HTTP e cache.
 * Deliberadamente `string` e nao `FeatureKey` — ver item 1 do comentario acima.
 */
export type FeatureKeyValue = string;

/**
 * Largura da coluna `featureKey` em `tenant_features`. Mantenha em sincronia
 * com a entidade TypeORM e a migration: o schema Zod usa este valor para
 * recusar chaves longas antes de o banco truncar/estourar.
 */
export const FEATURE_KEY_MAX_LENGTH = 50;
