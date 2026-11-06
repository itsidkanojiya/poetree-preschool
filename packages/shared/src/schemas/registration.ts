import { z } from 'zod';
import {
  GENDERS,
  GUARDIAN_RELATIONS,
  OTP_CHANNELS,
  REGISTRATION_STATUSES,
} from '../enums.js';
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
 * — or about the child, for the office to check against its own records.
 *
 * It no longer asks for an admission number. Asking for one meant a family
 * could only register if they were already holding a piece of paper from the
 * office, which is the wrong way round for a family joining the school: the
 * office issues that number, and now it does so when it approves.
 *
 * There is no school in the payload. The mobile app is one branded build per
 * school with the code compiled in, so the school comes from the path, exactly
 * as it does for the branding the sign-in screen already fetches.
 */
export const submitRegistrationSchema = z
  .object({
    /**
     * The child's name in three parts, as a school form in India asks for it:
     * given name, father's name, surname — "Dishan Krunal Patel".
     *
     * Only the given name is demanded. A family with one name between them is
     * rarer than a form that will not let them past, and the office can put
     * right on approval what the family could not type.
     */
    studentFirstName: z.string().trim().min(1, 'Enter your child’s name').max(60),
    studentMiddleName: z.string().trim().max(60).optional(),
    studentLastName: z.string().trim().max(60).optional(),
    /**
     * The child's birthday.
     *
     * Asked because a name on its own is not an identity — a school with two
     * Aaravs cannot tell which family this is — and because it is the one thing
     * about a child every parent knows without looking anything up.
     */
    studentDateOfBirth: z.coerce
      .date()
      .refine((value) => value.getTime() < Date.now(), {
        message: 'A date of birth cannot be in the future',
      })
      .refine((value) => value.getTime() > Date.now() - 25 * 365 * 24 * 60 * 60 * 1000, {
        message: 'Check the year — that is not a preschool child',
      }),

    /**
     * Who the account belongs to. The form no longer asks: the father's number
     * is the one that signs in, so this is his name and his number, and the
     * mother's number is kept beside them as the second one to ring.
     */
    guardianName: nameSchema,
    relation: z.enum(GUARDIAN_RELATIONS).default('FATHER'),
    /** The father's mobile. This is the sign-in, and the number the code went to. */
    phone: phoneSchema,
    /**
     * Proof that the number above answered.
     *
     * The challenge is raised and confirmed before this form is sent, so a
     * family finds out about a typo on the screen where they typed it rather
     * than a week later when nothing arrives.
     */
    phoneChallengeId: idSchema,
    /** Required now: a school with no email for a family has no second way to reach them. */
    email: emailSchema,
    /** And proof of that too — the same code, sent to the address instead. */
    emailChallengeId: idSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    /** Where the family lives. Required: the school needs it on the child's file. */
    address: z.string().trim().min(5, 'Enter your address').max(300),
    /**
     * The standard the child is to join — Nursery, Junior KG — from the
     * school's own list. Required: the office places the child in a class of
     * it when it approves.
     */
    classLevelId: idSchema,

    fatherName: z.string().trim().max(120).optional(),
    /**
     * Whose the second number is. The mother's, or — when hers is not
     * available — a guardian's, whose name is then required in `motherName`.
     */
    secondContactRelation: z.enum(['MOTHER', 'GUARDIAN']).default('MOTHER'),
    /** The mother's name, or the guardian's when `secondContactRelation` is GUARDIAN. */
    motherName: z.string().trim().max(120).optional(),
    /** The second number, asked for because the first one is not always answered. */
    motherPhone: phoneSchema,
    /** Proof that the second number answered too, as for the first. */
    motherPhoneChallengeId: idSchema,
    /** The mother's — or the guardian's — email. Optional. */
    motherEmail: emailSchema.optional(),
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
  })
  .refine(
    (v) => v.secondContactRelation !== 'GUARDIAN' || (v.motherName?.trim().length ?? 0) >= 2,
    { message: 'Enter the guardian’s name', path: ['motherName'] },
  )
  .refine((v) => lastTenDigits(v.motherPhone) !== lastTenDigits(v.phone), {
    message: 'The second number must be a different phone from the father’s',
    path: ['motherPhone'],
  });
export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;

/** "+91 98200 00000" and "9820000000" are the same phone. */
function lastTenDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '').slice(-10);
}

/**
 * A parent who is signed in asking the school to add another child to their
 * account — a brother or sister joining. No account is opened: the office
 * approves it like any registration, and the child is linked to this parent.
 */
export const addChildRequestSchema = z.object({
  studentFirstName: z.string().trim().min(1, 'Enter your child’s name').max(60),
  studentMiddleName: z.string().trim().max(60).optional(),
  studentLastName: z.string().trim().max(60).optional(),
  studentDateOfBirth: z.coerce
    .date()
    .refine((value) => value.getTime() < Date.now(), {
      message: 'A date of birth cannot be in the future',
    })
    .refine((value) => value.getTime() > Date.now() - 25 * 365 * 24 * 60 * 60 * 1000, {
      message: 'Check the year — that is not a preschool child',
    }),
  classLevelId: idSchema,
  bloodGroup: z.string().trim().max(8).optional(),
});
export type AddChildRequestInput = z.infer<typeof addChildRequestSchema>;

/** A parent's own request for another child, as the app lists it. */
export interface ChildRequestSummary {
  id: string;
  studentName: string;
  classLevel: string | null;
  status: (typeof REGISTRATION_STATUSES)[number];
  submittedAt: string;
  rejectionReason: string | null;
}

/** A standard a school takes children into, for the registration form. */
export interface SchoolStandard {
  id: string;
  name: string;
}

/** All the answer a stranger gets. Never whether the child exists. */
export interface SubmitRegistrationResponse {
  status: 'PENDING';
  message: string;
}

/**
 * The office correcting a family's request while it waits for verification —
 * a misspelt name, the wrong birthday, the class they meant.
 *
 * Not the two mobiles or the email: those were proved with codes, and an
 * account opened on a number nobody proved would undo that. Nothing here is
 * accepted once the request is verified or turned down.
 */
export const updateRegistrationSchema = z
  .object({
    studentFirstName: z.string().trim().min(1).max(60),
    studentMiddleName: z.string().trim().max(60).nullable(),
    studentLastName: z.string().trim().max(60).nullable(),
    studentDateOfBirth: z.coerce
      .date()
      .refine((value) => value.getTime() < Date.now(), {
        message: 'A date of birth cannot be in the future',
      }),
    classLevelId: idSchema.nullable(),
    bloodGroup: z.string().trim().max(8).nullable(),
    guardianName: nameSchema,
    fatherName: z.string().trim().max(120).nullable(),
    secondContactRelation: z.enum(['MOTHER', 'GUARDIAN']),
    motherName: z.string().trim().max(120).nullable(),
    motherEmail: emailSchema.nullable(),
    address: z.string().trim().min(5).max(300).nullable(),
    emergencyContactName: z.string().trim().max(120).nullable(),
    emergencyContactPhone: phoneSchema.nullable(),
  })
  .partial();
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;

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

  /**
   * The admission number, once there is one.
   *
   * Null while the request is waiting: the office issues it on approval, which
   * is the whole point of the change that removed it from the form.
   */
  admissionNo: string | null;
  /** The second number on the form — the mother's or a guardian's. The first is `phone`. */
  motherPhone: string | null;
  /** Whose the second number is. */
  secondContactRelation: (typeof GUARDIAN_RELATIONS)[number];
  /** True when the second number was proved with a code. */
  motherPhoneVerified: boolean;
  motherEmail: string | null;
  /** The standard asked for. Null on rows from before the form asked. */
  classLevel: { id: string; name: string } | null;
  /**
   * The account this child is for, when the family already has one here — a
   * parent adding a second child, or a teacher registering their own. Approving
   * links the child to it; no new account is opened.
   */
  parentAccount: {
    userId: string;
    name: string;
    roles: Array<'TEACHER' | 'PARENT'>;
  } | null;
  /** The three parts written out, which is what the queue shows and searches. */
  studentName: string;
  /** The parts as typed, for correcting them. Null on rows from before the form asked. */
  studentFirstName: string | null;
  studentMiddleName: string | null;
  studentLastName: string | null;
  /** ISO date. Null on rows submitted before the form asked for it. */
  studentDateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;

  /**
   * The child this became, once the office decided. Null while it is waiting:
   * a request no longer names a child on the roll, because it no longer has to
   * have been one.
   */
  student: StudentMatch | null;

  /**
   * Children already on the roll who look like the one described.
   *
   * The office is deciding between two things — this family's new child, or a
   * sibling of one already here — and the screen should put the candidates in
   * front of them rather than make them go and search.
   */
  matches: StudentMatch[];

  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

/** A child on the roll, as the decision screen shows them. */
export interface StudentMatch {
  id: string;
  name: string;
  admissionNo: string;
  /** ISO date, so the office can tell two children of the same name apart. */
  dateOfBirth: string;
  classroom: string | null;
  photoUrl: string | null;
}

/**
 * How the office approves: by pointing at a child, or by making one.
 *
 * Both halves exist because both cases are ordinary. A second child of a family
 * already here is on the roll and must not be duplicated; a family joining for
 * the first time has no record yet, and the office creating it at the moment it
 * says yes is one step instead of two.
 */
export const approveRegistrationSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('LINK'),
    studentId: idSchema,
  }),
  z.object({
    mode: z.literal('CREATE'),
    /** Issued from the school's own series when left out. */
    admissionNo: z.string().trim().max(40).optional(),
    gender: z.enum(GENDERS),
    /** Optional: a child can be admitted before the class is settled. */
    classroomId: idSchema.optional(),
  }),
]);
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;

/**
 * Asking for a code, and sending one back.
 *
 * Both run before anybody has an account, on the same public route as the
 * registration itself, and both are rate limited there: a code-sending endpoint
 * with no ceiling is somebody else's phone ringing all night at your expense.
 */
export const sendOtpSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('PHONE'), destination: phoneSchema }),
  z.object({ channel: z.literal('EMAIL'), destination: emailSchema }),
]);
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export interface SendOtpResponse {
  challengeId: string;
  expiresInSeconds: number;
  /**
   * False while no message is really being sent — the fixed-code setup used
   * until there is an SMS account. The app says so on screen rather than
   * leaving a family waiting for a text that was never sent.
   */
  delivered: boolean;
  /**
   * How many digits the code has — six from a real provider, the fixed code's
   * own length until then. The app draws one box per digit.
   */
  codeLength: number;
}

export const otpChannelSchema = z.enum(OTP_CHANNELS);

export const verifyOtpSchema = z.object({
  challengeId: idSchema,
  code: z.string().trim().regex(/^[0-9]{4,6}$/, 'The code is 4 to 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const registrationIdSchema = z.object({ id: idSchema });
