import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from '../../../common/validation/password.schema';

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    // A politica vem de common/validation: a mesma regra vale para o admin
    // trocando a senha de outro usuario e para o validador registrado no
    // EmailPassword.init(), que e o unico ponto que os endpoints nativos do
    // SuperTokens tambem atravessam.
    newPassword: passwordSchema,
    // Sem min/max proprio: o unico requisito e ser igual a newPassword, que ja
    // carrega a politica. Repetir as regras aqui duplicaria cada mensagem de
    // erro sem informar nada novo.
    confirmPassword: z.string().min(1, 'Confirmação de senha obrigatória'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem',
  });

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export class ResetPasswordSwagger {
  @ApiProperty({ example: 'token-recebido-por-e-mail' })
  token!: string;

  @ApiProperty({
    example: 'NovaSenha123',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Mínimo 8 caracteres, com ao menos uma letra maiúscula, uma minúscula e um número',
  })
  newPassword!: string;

  @ApiProperty({
    example: 'NovaSenha123',
    description: 'Precisa ser idêntica a newPassword',
  })
  confirmPassword!: string;
}
