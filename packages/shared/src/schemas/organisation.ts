import { z } from 'zod';
import { nameSchema, schoolCodeSchema } from './common.js';
import type { SchoolStatus } from '../enums.js';

/**
 * A group of schools under one owner — "Sunrise Group", with a branch in Nikol
 * and another in Naroda.
 *
 * A branch is a `School` row, not a second dimension on every table. Every
 * operational table in the platform is keyed on `schoolId` and filtered by one
 * Prisma extension; making a branch anything other than a school would mean a
 * `branchId` on forty-six tables and a second filter to get wrong. As a school
 * row, a branch gets its own children, staff, fees, admission numbers and ID
 * card settings for nothing, already isolated.
 *
 * An independent school has no organisation at all. `organisationId` is null
 * and nothing about it changes.
 */
export const createOrganisationSchema = z.object({
  name: nameSchema,
  /**
   * Optional. Generated from the name when absent — and the generated one is
   * what the Super Admin will almost always keep.
   */
  code: schoolCodeSchema.optional(),
});
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/** `code` is absent for the same reason a school's is: builds are keyed on it. */
export const updateOrganisationSchema = z.object({ name: nameSchema });
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

export interface OrganisationSummary {
  id: string;
  name: string;
  code: string;
  branchCount: number;
  createdAt: string;
}

/** One branch, as a group administrator picking between them sees it. */
export interface BranchSummary {
  id: string;
  name: string;
  code: string;
  city: string | null;
  status: SchoolStatus;
  /** True for the branch this session is currently working in. */
  isCurrent: boolean;
  counts: {
    students: number;
    teachers: number;
  };
}

/** The group overview: every branch, side by side. */
export interface OrganisationOverview {
  organisation: OrganisationSummary;
  branches: BranchSummary[];
  totals: {
    students: number;
    teachers: number;
  };
}
