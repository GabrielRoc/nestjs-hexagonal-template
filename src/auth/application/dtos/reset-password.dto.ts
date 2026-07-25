import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Deve conter pelo menos um número');

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem',
  });

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export class ResetPasswordSwagger {
  @ApiProperty({ example: 'token-recebido-por-e-mail' })
  token!: string;

  @ApiProperty({ example: 'NovaSenha123', minLength: 8, maxLength: 128 })
  newPassword!: string;

  @ApiProperty({ example: 'NovaSenha123', minLength: 8, maxLength: 128 })
  confirmPassword!: string;
}
