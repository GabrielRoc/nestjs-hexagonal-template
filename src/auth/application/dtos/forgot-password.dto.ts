import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export class ForgotPasswordSwagger {
  @ApiProperty({ example: 'joao@email.com' })
  email!: string;
}
