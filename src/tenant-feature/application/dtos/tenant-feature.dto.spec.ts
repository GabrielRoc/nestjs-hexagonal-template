import { FEATURE_NUMERIC_VALUE_MAX } from '../../domain/enums/feature-key.enum';
import { updateTenantFeatureSchema } from './tenant-feature.dto';

function parseNumericValue(numericValue: unknown) {
  return updateTenantFeatureSchema.safeParse({
    featureKey: 'MAX_ITEMS',
    enabled: true,
    numericValue,
  });
}

describe('updateTenantFeatureSchema', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita o teto da coluna integer', () => {
    expect(parseNumericValue(FEATURE_NUMERIC_VALUE_MAX).success).toBe(true);
  });

  it('recusa valor acima do teto da coluna integer', () => {
    // Antes deste limite o Zod aprovava (`.int()` aceita qualquer inteiro
    // seguro do JS) e o Postgres respondia `22003 integer out of range`, que o
    // GlobalExceptionFilter entrega como 500 em vez de 400.
    expect(parseNumericValue(FEATURE_NUMERIC_VALUE_MAX + 1).success).toBe(
      false,
    );
  });

  it('aceita 0 como limite', () => {
    // Cota zero e um estado legitimo e diferente de "sem limite"; `enabled:
    // false` nao substitui, porque ali getNumericLimit() devolve null.
    expect(parseNumericValue(0).success).toBe(true);
  });

  it('recusa limite negativo', () => {
    expect(parseNumericValue(-1).success).toBe(false);
  });

  it('recusa limite fracionario', () => {
    expect(parseNumericValue(1.5).success).toBe(false);
  });

  it('aceita null (limpar) e a ausencia do campo (manter)', () => {
    expect(parseNumericValue(null).success).toBe(true);

    const omitted = updateTenantFeatureSchema.safeParse({
      featureKey: 'MAX_ITEMS',
      enabled: true,
    });
    expect(omitted.success).toBe(true);
    expect(omitted.success && omitted.data.numericValue).toBeUndefined();
  });
});
