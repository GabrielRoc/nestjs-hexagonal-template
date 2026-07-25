import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Corpo do envelope de erro produzido por GlobalExceptionFilter.
 * Mantenha em sincronia com src/common/filters/global-exception.filter.ts.
 */
export class ErrorBodySwagger {
  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Erro de validação' })
  message!: string;

  /**
   * ZodValidationPipe e o ramo de array do filtro emitem sempre uma lista de
   * `{ field, message }`; declarar como objeto quebraria os clientes gerados.
   */
  @ApiPropertyOptional({
    description:
      'Detalhes adicionais. Para erros de validação, um item por campo.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        message: { type: 'string' },
      },
    },
    example: [{ field: 'name', message: 'Obrigatório' }],
  })
  details?: { field: string; message: string }[];
}

export class ErrorResponseSwagger {
  @ApiProperty({ type: ErrorBodySwagger })
  error!: ErrorBodySwagger;
}

/**
 * Metadados de paginação produzidos por buildPaginationMeta.
 * Mantenha em sincronia com src/common/utils/pagination.util.ts.
 */
export class PaginationMetaSwagger {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  perPage!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  @ApiProperty({ example: false })
  hasPrevious!: boolean;
}
