import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from '../../../common/validation/password.schema';

const allowedRoles = [Role.ADMIN, Role.USER] as const;

export const createUserSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().min(10).max(20).optional(),
  role: z.enum(allowedRoles),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().min(10).max(20).optional().nullable(),
  role: z.enum(allowedRoles).optional(),
});

// Mesma politica do fluxo self-service de reset: uma senha provisionada por um
// admin nao pode ser mais fraca do que a que o proprio usuario conseguiria
// definir, senao a conta ficaria com uma credencial que a API declara invalida.
export const updateUserPasswordSchema = z.object({
  newPassword: passwordSchema,
});

// Estado desejado explicito em vez de toggle: repetir a requisicao apos uma
// falha parcial precisa reexecutar a mesma intencao, nunca invertê-la.
export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UpdateUserPasswordDto = z.infer<typeof updateUserPasswordSchema>;
export type SetUserActiveDto = z.infer<typeof setUserActiveSchema>;

export class UpdateUserPasswordSwagger {
  @ApiProperty({
    example: 'NovaSenha123',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Mínimo 8 caracteres, com ao menos uma letra maiúscula, uma minúscula e um número',
  })
  newPassword!: string;
}

export class SetUserActiveSwagger {
  @ApiProperty({
    example: false,
    description: 'Estado desejado da conta. Enviar o mesmo valor é idempotente',
  })
  isActive!: boolean;
}

export interface UserResponseDto {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
