import { z } from 'zod';
import { SCHOOL_STATUSES } from '../enums.js';
import {
  emailSchema,
  hexColorSchema,
  idSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  phoneSchema,
  schoolCodeSchema,
  urlSchema,
} from './common.js';

export const createSchoolSchema = z.object({
  name: nameSchema,
  /** Immutable once created — it becomes the Android application id in Phase 2. */
  code: schoolCodeSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  principalName: z.string().trim().max(120).optional(),
  logoUrl: urlSchema.optional(),
  primaryColor: hexColorSchema.optional(),
});
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

/** `code` is deliberately absent — changing it would orphan the future app build. */
export const updateSchoolSchema = createSchoolSchema.omit({ code: true }).partial();
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

/**
 * How long this school's access lasts.
 *
 * Null means no end date — they stay on until somebody sets one. A date in the
 * past locks them out immediately, which is the fastest way to stop a school
 * that has not paid without suspending them by hand.
 */
export const setSchoolValiditySchema = z.object({ validUntil: z.coerce.date().nullable() });
export type SetSchoolValidityInput = z.infer<typeof setSchoolValiditySchema>;

/** Null clears it. */
export const setSchoolLogoSchema = z.object({ fileId: idSchema.nullable() });
export type SetSchoolLogoInput = z.infer<typeof setSchoolLogoSchema>;

export const listSchoolsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(SCHOOL_STATUSES).optional(),
});
export type ListSchoolsQuery = z.infer<typeof listSchoolsQuerySchema>;

export const createSchoolAdminSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});
export type CreateSchoolAdminInput = z.infer<typeof createSchoolAdminSchema>;

export const assignSubscriptionSchema = z
  .object({
    planId: idSchema,
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date(),
  })
  .refine((v) => !v.startsAt || v.expiresAt > v.startsAt, {
    message: 'Expiry must be after the start date',
    path: ['expiresAt'],
  });
export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>;

export const suspendSchoolSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason — it is written to the audit log').max(500),
});
export type SuspendSchoolInput = z.infer<typeof suspendSchoolSchema>;

export const reactivateSchoolSchema = z.object({
  note: z.string().trim().max(500).optional(),
  /** Optionally extend the plan while reactivating. */
  expiresAt: z.coerce.date().optional(),
});
export type ReactivateSchoolInput = z.infer<typeof reactivateSchoolSchema>;

/**
 * One of a school's own administrators, as the publisher sees them.
 *
 * The portal could create these and never look at them: a support call about
 * "our login stopped working" had no screen to answer it from, and the Users
 * tile said 1 without saying who.
 */
export interface SchoolAdminSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  /** Null until they have signed in once — which is the useful part. */
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SchoolSummary {
  id: string;
  name: string;
  code: string;
  city: string | null;
  status: (typeof SCHOOL_STATUSES)[number];
  logoUrl: string | null;
  primaryColor: string | null;
  planName: string | null;
  expiresAt: string | null;
  /** The school's own end date, which is what actually gates them. */
  validUntil: string | null;
  counts: {
    users: number;
    teachers: number;
    students: number;
  };
  createdAt: string;
}
