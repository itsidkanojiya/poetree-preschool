import { z } from 'zod';

/** Prisma `cuid()` primary keys. */
export const idSchema = z.string().cuid('Invalid id');

export const idParamSchema = z.object({ id: idSchema });

/**
 * A school code doubles as the Android application-id segment in Phase 2
 * (`com.poetree.<code>`), so it is restricted to a valid package segment now:
 * starts with a letter, lowercase alphanumeric only, 3–30 characters.
 */
export const schoolCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9]{2,29}$/,
    'Code must start with a letter and contain only lowercase letters and digits (3–30 chars)',
  );

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email address').max(160);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s\-()]{6,19}$/, 'Invalid phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour such as #2563EB');

export const nameSchema = z.string().trim().min(2, 'Too short').max(120);

export const urlSchema = z.string().trim().url('Invalid URL').max(500);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
