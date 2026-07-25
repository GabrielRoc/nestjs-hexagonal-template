import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { PaginationMetaSwagger } from '../../../common/swagger/common.swagger';

/**
 * Um arquivo por recurso, com os schemas Zod (validacao em runtime) e as classes
 * Swagger (contrato publicado) lado a lado: quando um campo muda, os dois estao
 * na mesma tela e ninguem esquece o outro.
 *
 * Os schemas Zod sao a unica fonte de verdade da validacao; as classes Swagger
 * existem porque o `@nestjs/swagger` monta o schema OpenAPI a partir de metadata
 * de classe e nao sabe ler um `ZodType`.
 */

// --- Schemas Zod ---

export const createSampleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  // Ausente => o use case joga para o fim da lista (ver CreateSampleUseCase).
  sortOrder: z.number().int().min(0).optional(),
});

export const updateSampleSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Agendamento do job de desativacao (fila `sample`). Teto de 24h: delay maior
// deixa o job parado no Redis por tempo demais — nesses casos use um scheduler.
export const scheduleSampleDeactivationSchema = z.object({
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional()
    .default(0),
});

export type CreateSampleDto = z.infer<typeof createSampleSchema>;
export type UpdateSampleDto = z.infer<typeof updateSampleSchema>;
export type ScheduleSampleDeactivationDto = z.infer<
  typeof scheduleSampleDeactivationSchema
>;

export interface SampleResponseDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// --- Classes Swagger ---

export class CreateSampleSwagger {
  @ApiProperty({ example: 'Primeiro registro', minLength: 2, maxLength: 255 })
  name!: string;

  @ApiPropertyOptional({ example: 'Descricao livre', maxLength: 1000 })
  description?: string;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    description: 'Posicao na ordenacao. Omitido, entra no fim da lista.',
  })
  sortOrder?: number;
}

export class UpdateSampleSwagger {
  @ApiPropertyOptional({
    example: 'Primeiro registro',
    minLength: 2,
    maxLength: 255,
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'Descricao livre',
    maxLength: 1000,
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({ example: true })
  isActive?: boolean;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  sortOrder?: number;
}

export class SampleSwagger {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  tenantId!: string;

  @ApiProperty({ example: 'Primeiro registro' })
  name!: string;

  @ApiProperty({ example: 'Descricao livre', nullable: true })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt!: string;
}

/**
 * As respostas sao declaradas COM o envelope `{ data }` / `{ data, meta }`.
 * Anotar `type: SampleSwagger` direto publica um contrato que a API nao cumpre
 * e gera cliente quebrado.
 */
export class SampleResponseSwagger {
  @ApiProperty({ type: SampleSwagger })
  data!: SampleSwagger;
}

export class SampleListMetaSwagger {
  @ApiProperty({ type: PaginationMetaSwagger })
  pagination!: PaginationMetaSwagger;
}

export class SampleListResponseSwagger {
  @ApiProperty({ type: [SampleSwagger] })
  data!: SampleSwagger[];

  @ApiProperty({ type: SampleListMetaSwagger })
  meta!: SampleListMetaSwagger;
}
