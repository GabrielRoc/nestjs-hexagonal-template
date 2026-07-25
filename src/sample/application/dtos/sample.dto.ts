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
export type ListSamplesQuery = z.infer<typeof listSamplesQuerySchema>;
export type ScheduleSampleDeactivationDto = z.infer<
  typeof scheduleSampleDeactivationSchema
>;

export interface SampleResponseDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
