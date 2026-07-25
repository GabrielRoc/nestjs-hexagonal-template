import { Sample } from '../../src/sample/domain/entities/sample.entity';

/**
 * Fabrica de entidade para os testes. Um unico lugar decide como e um `Sample`
 * valido; cada teste sobrescreve **apenas** o campo que a sua assercao depende
 * (`makeSample({ isActive: false })`). Assim o teste diz o que importa e o
 * leitor nao precisa filtrar dez campos de ruido para achar a variavel do caso.
 *
 * Datas fixas de proposito: `new Date()` faz a assercao mudar a cada execucao.
 *
 * Fica em `test/factories/` porque `tsconfig.build.json` exclui `test/` e
 * `**\/*spec.ts` — codigo de teste nao entra em `dist/`.
 */

/** Dois tenants distintos: todo teste de isolamento precisa de um "outro". */
export const TENANT_A = '11111111-1111-4111-8111-111111111111';
export const TENANT_B = '22222222-2222-4222-8222-222222222222';

export const SAMPLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export function makeSample(overrides: Partial<Sample> = {}): Sample {
  const sample = new Sample({
    id: SAMPLE_ID,
    tenantId: TENANT_A,
    name: 'Sample de teste',
    description: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2024-01-15T10:30:00.000Z'),
    updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    deletedAt: null,
  });
  // Object.assign e nao spread: o retorno precisa continuar sendo uma instancia
  // de Sample (o mapper chama `createdAt.toISOString()`).
  return Object.assign(sample, overrides);
}
