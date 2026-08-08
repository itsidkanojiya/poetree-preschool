import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const createPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{2,29}$/, 'Use uppercase letters, digits and underscores'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  /** `null` means unlimited. */
  maxStudents: z.number().int().min(1).max(100_000).nullable().default(null),
  maxTeachers: z.number().int().min(1).max(10_000).nullable().default(null),
  /** Stored in the smallest currency unit (paise) to avoid float rounding. */
  priceInPaise: z.number().int().min(0).default(0),
  billingPeriodMonths: z.number().int().min(1).max(60).default(12),
  features: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  isActive: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.omit({ code: true }).partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const listPlansQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

export interface PlanSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxStudents: number | null;
  maxTeachers: number | null;
  priceInPaise: number;
  billingPeriodMonths: number;
  features: string[];
  isActive: boolean;
  schoolCount: number;
}
