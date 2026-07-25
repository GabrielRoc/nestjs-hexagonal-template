import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import {
  FEATURE_KEY_MAX_LENGTH,
  FEATURE_NUMERIC_VALUE_MAX,
  FeatureKey,
} from '../../domain/enums/feature-key.enum';

const declaredFeatureKeys: string[] = Object.values(FeatureKey);

/**
 * Validacao da chave de feature.
 *
 * Com o `FeatureKey` preenchido a validacao e por pertencimento: chave
 * desconhecida vira 400 antes de chegar ao banco.
 *
 * Com o enum vazio (estado em que o template e entregue) `Object.values()` e
 * `[]` e um `z.enum([])` rejeitaria TODA entrada — o endpoint de admin ficaria
 * respondendo 400 para qualquer corpo, o que parece bug e nao configuracao.
 * Nesse caso o fallback valida so o formato (nao-vazio, dentro do limite da
 * coluna). Preencha `FeatureKey` para ganhar a validacao por pertencimento.
 */
export const featureKeySchema: z.ZodType<string> =
  declaredFeatureKeys.length > 0
    ? z.enum(declaredFeatureKeys as [string, ...string[]])
    : z.string().trim().min(1).max(FEATURE_KEY_MAX_LENGTH);

/**
 * `:id` das rotas de admin. Sem isso, um id malformado chegaria a query e o
 * Postgres devolveria erro de cast de uuid (500) em vez de 400.
 */
export const tenantIdParamSchema = z.uuid();

/**
 * `numericValue` tem tres estados, e os tres significam coisas diferentes:
 *
 * - AUSENTE: nao mexe no valor guardado (o use case le o atual e o mantem).
 * - `null`: limpa o limite explicitamente.
 * - inteiro de 0 a FEATURE_NUMERIC_VALUE_MAX: define o limite. 0 e valido
 *   (cota zero); o teto vem do tipo da coluna, ver o comentario da constante.
 */
export const updateTenantFeatureSchema = z.object({
  featureKey: featureKeySchema,
  enabled: z.boolean(),
  numericValue: z
    .number()
    .int()
    .min(0)
    .max(FEATURE_NUMERIC_VALUE_MAX)
    .nullable()
    .optional(),
});

export const bulkUpdateTenantFeaturesSchema = z.object({
  features: z
    .array(updateTenantFeatureSchema)
    .min(1)
    .refine(
      (features) =>
        new Set(features.map((f) => f.featureKey)).size === features.length,
      { message: 'As chaves de feature devem ser unicas' },
    ),
});

export type UpdateTenantFeatureDto = z.infer<typeof updateTenantFeatureSchema>;
export type BulkUpdateTenantFeaturesDto = z.infer<
  typeof bulkUpdateTenantFeaturesSchema
>;

export interface TenantFeatureResponseDto {
  featureKey: string;
  enabled: boolean;
  numericValue: number | null;
}

/** Espelha TenantFeatureResponseDto para a documentacao Swagger. */
export class TenantFeatureSwagger {
  @ApiProperty({ example: 'EXAMPLE' })
  featureKey!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({
    example: 100,
    nullable: true,
    type: Number,
    description: 'Limite numerico associado a flag, quando houver',
  })
  numericValue!: number | null;
}

export class TenantFeatureListResponseSwagger {
  @ApiProperty({ type: [TenantFeatureSwagger] })
  data!: TenantFeatureSwagger[];
}

export class UpdateTenantFeatureSwagger {
  @ApiProperty({
    example: 'EXAMPLE',
    description:
      'Chave declarada em FeatureKey. Com o enum vazio, qualquer string nao-vazia e aceita.',
  })
  featureKey!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({
    example: 100,
    nullable: true,
    required: false,
    type: Number,
    minimum: 0,
    maximum: FEATURE_NUMERIC_VALUE_MAX,
    description:
      'Limite numerico da flag. Omita para manter o valor atual, envie null para limpar. 0 e um limite valido (cota zero).',
  })
  numericValue?: number | null;
}

export class BulkUpdateTenantFeaturesSwagger {
  @ApiProperty({ type: [UpdateTenantFeatureSwagger], minItems: 1 })
  features!: UpdateTenantFeatureSwagger[];
}
