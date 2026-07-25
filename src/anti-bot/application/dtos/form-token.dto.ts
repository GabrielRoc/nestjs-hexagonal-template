import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * `context` entra no payload assinado, entao precisa de limite: sem isso um
 * cliente escolhe o tamanho do token que a API emite. Formato restrito porque o
 * valor e so um rotulo (`signup`, `contact-form`).
 */
export const formTokenQuerySchema = z.object({
  context: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.')
    .optional(),
});

export type FormTokenQueryDto = z.infer<typeof formTokenQuerySchema>;

export class FormTokenSwagger {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIu...',
  })
  token!: string;

  @ApiProperty({ example: '2024-01-15T11:00:00.000Z' })
  expiresAt!: string;
}

export class TurnstileConfigSwagger {
  @ApiProperty({ example: false })
  enabled!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Site key pública do widget; null quando desabilitado.',
  })
  siteKey!: string | null;
}

export class AntiBotConfigSwagger {
  @ApiProperty({ type: TurnstileConfigSwagger })
  turnstile!: TurnstileConfigSwagger;
}
