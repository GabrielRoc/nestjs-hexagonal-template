import { z } from 'zod';
import { Role } from '../../../common/enums/role.enum';

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

export const updateUserPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UpdateUserPasswordDto = z.infer<typeof updateUserPasswordSchema>;

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
