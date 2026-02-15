import { z } from 'zod';

export const createSampleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
});

export const updateSampleSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const listSamplesQuerySchema = z.object({
  page: z.string().optional().default('1'),
  perPage: z.string().optional().default('20'),
});

export type CreateSampleDto = z.infer<typeof createSampleSchema>;
export type UpdateSampleDto = z.infer<typeof updateSampleSchema>;
export type ListSamplesQuery = z.infer<typeof listSamplesQuerySchema>;

export interface SampleResponseDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
