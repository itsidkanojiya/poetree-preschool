import { z } from 'zod';
import { GUARDIAN_RELATIONS, REGISTRATION_STATUSES } from '../enums.js';
import {
  emailSchema,
  idSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  phoneSchema,
} from './common.js';

/**
 * A parent asking their school for access.
 *
 * Submitted from the app before anyone has signed in, so this is the only
 * schema in the platform that is validated on a request carrying no token at
 * all. Everything in it is either about the guardian — who becomes the account
 * — or a claim about a child the school has already enrolled, for the office to
 * check against its own records.
 *
 * There is no school in the payload. The mobile app is one branded build per
 * school with the code compiled in, so the school comes from the path, exactly
 * as it does for the branding the sign-in screen already fetches.
 */
export const submitRegistrationSchema = z
  .object({
    /**
     * The child's admission number, which is what makes this a claim rather
     * than an application. The school issued it; a family that does not have
     * one has not been enrolled yet and should be talking to the office.
     */
    admissionNo: z.string().trim().min(1).max(40),
    /** What the parent believes the child is called, checked against the roll. */
    studentName: nameSchema,

    guardianName: nameSchema,
    relation: z.enum(GUARDIAN_RELATIONS),
    phone: phoneSchema,
    email: emailSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
    address: z.string().trim().max(300).optional(),

    fatherName: z.string().trim().max(120).optional(),
    motherName: z.string().trim().max(120).optional(),
    bloodGroup: z.string().trim().max(8).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: phoneSchema.optional(),

    /**
     * The declaration, which must be ticked.
     *
     * `literal(true)` rather than a boolean: an unticked box is a validation
     * failure with a message, not a quietly-stored `false` that nobody ever
     * looks at again.
     */
    declarationAccepted: z.literal(true),
    termsAccepted: z.literal(true),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });
export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;

/** All the answer a stranger gets. Never whether the child exists. */
export interface SubmitRegistrationResponse {
  status: 'PENDING';
  message: string;
}

export const listRegistrationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REGISTRATION_STATUSES).optional(),
});
export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;

export const rejectRegistrationSchema = z.object({
  /**
   * Why, in words the office would say on the phone.
   *
   * Optional because a rejection is often a phone call and a tap, and forcing a
   * sentence would get "x" typed into it.
   */
  reason: z.string().trim().max(300).optional(),
});
export type RejectRegistrationInput = z.infer<typeof rejectRegistrationSchema>;

/** One row of the school's queue. */
export interface RegistrationSummary {
  id: string;
  status: (typeof REGISTRATION_STATUSES)[number];

  guardianName: string;
  relation: (typeof GUARDIAN_RELATIONS)[number];
  phone: string;
  email: string | null;
  address: string | null;

  /** What the parent claimed. */
  admissionNo: string;
  studentName: string;
  fatherName: string | null;
  motherName: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;

  /**
   * The child it actually matched, as the school knows them.
   *
   * Shown beside the claim so the office is comparing two things rather than
   * trusting one: a name that does not match the admission number is exactly
   * what this screen exists to catch.
   */
  student: {
    id: string;
    name: string;
    admissionNo: string;
    classroom: string | null;
    photoUrl: string | null;
  };

  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

export const registrationIdSchema = z.object({ id: idSchema });
