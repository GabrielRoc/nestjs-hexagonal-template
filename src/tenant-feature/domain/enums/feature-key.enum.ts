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
 * com a entidade TypeORM: o schema Zod usa este valor para recusar chaves
 * longas antes de o banco truncar/estourar.
 */
export const FEATURE_KEY_MAX_LENGTH = 50;

/**
 * Teto de `numericValue` em `tenant_features`. A coluna e `integer` (int32), e
 * `z.number().int()` sozinho aceita qualquer inteiro seguro do JS (±2^53) — sem
 * este limite, um valor acima de 2^31-1 passa pela validacao e o Postgres
 * responde `22003 integer out of range`, que o GlobalExceptionFilter entrega
 * como 500 em vez de 400. Mesmo cuidado de FEATURE_KEY_MAX_LENGTH: par
 * schema/coluna explicito.
 *
 * O piso e 0, nao 1: cota zero e um estado legitimo ("o plano nao permite
 * nenhum item") e diferente de nao ter limite. `enabled: false` nao serve de
 * substituto — nesse caso `getNumericLimit()` devolveria null (sem limite), o
 * oposto do pretendido.
 */
export const FEATURE_NUMERIC_VALUE_MAX = 2_147_483_647;
