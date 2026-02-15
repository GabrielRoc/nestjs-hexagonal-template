import { z } from 'zod';
import { validateCnpj } from '../../../common/utils/validate-cnpj';

export const createTenantSchema = z.object({
  name: z.string().min(2).max(255),
  document: z
    .string()
    .min(14)
    .max(18)
    .refine(validateCnpj, { message: 'CNPJ inválido' }),
  email: z.string().email(),
  phone: z.string().min(10).max(20),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
  isActive: z.boolean().optional(),
});

export type CreateTenantDto = z.infer<typeof createTenantSchema>;
export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;

export interface TenantResponseDto {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
