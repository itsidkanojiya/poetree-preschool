import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * Fee installment plans, reminders, follow-ups, and the installment detail a
 * family opens. Money is integer paise everywhere; dates are YYYY-MM-DD.
 */

/** Where an installment stands, worked out by the server from what is recorded. */
export const INSTALLMENT_STATES = [
  'PAID',
  'PARTIAL',
  'OVERDUE',
  'DUE_TODAY',
  'DUE_SOON',
  'UPCOMING',
  'CANCELLED',
] as const;
export type InstallmentState = (typeof INSTALLMENT_STATES)[number];

/* -------------------------------------------------------------------------- */
/* The office: plans                                                          */
/* -------------------------------------------------------------------------- */

export const feePlanInstallmentSchema = z.object({
  label: z.string().trim().min(1, 'Name each installment').max(40),
  dueDate: z.coerce.date(),
  /** Its share of the year: 1, 1, 1 for three equal parts. */
  weight: z.coerce.number().int().min(1).max(100).default(1),
});

export const saveFeePlanSchema = z
  .object({
    academicYearId: idSchema,
    name: z.string().trim().min(2, 'Give the plan a name').max(60),
    isEnabled: z.boolean().default(true),
    /** Empty: offered to every class. */
    classLevelIds: z.array(idSchema).max(40).default([]),
    installments: z
      .array(feePlanInstallmentSchema)
      .min(1, 'A plan needs at least one installment')
      .max(12, 'A plan has at most twelve installments'),
  })
  .superRefine((plan, ctx) => {
    const labels = plan.installments.map((i) => i.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: 'Each installment needs its own name',
      });
    }
    for (let i = 1; i < plan.installments.length; i += 1) {
      if (plan.installments[i]!.dueDate < plan.installments[i - 1]!.dueDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installments', i, 'dueDate'],
          message: 'Put the installments in date order',
        });
      }
    }
  });
export type SaveFeePlanInput = z.infer<typeof saveFeePlanSchema>;

export interface FeePlanView {
  id: string;
  academicYearId: string;
  academicYearName: string;
  name: string;
  isEnabled: boolean;
  classLevelIds: string[];
  classLevels: Array<{ id: string; name: string }>;
  installments: Array<{ label: string; dueDate: string; weight: number }>;
  /** Children whose fees are paid by it this year. */
  selections: number;
  /** What one installment comes to for each class it covers, before concessions. */
  preview: Array<{
    classLevelId: string;
    classLevelName: string;
    yearInPaise: number;
    installmentsInPaise: number[];
  }>;
}

/* -------------------------------------------------------------------------- */
/* The office: reminders                                                      */
/* -------------------------------------------------------------------------- */

export const feeReminderPolicySchema = z.object({
  enabled: z.boolean(),
  /** Days before the due date, e.g. 7 and 3. */
  daysBefore: z
    .array(z.coerce.number().int().min(1).max(60))
    .max(5)
    .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
  onDueDate: z.boolean(),
  graceDays: z.coerce.number().int().min(0).max(60),
  overdueEveryDays: z.coerce.number().int().min(0).max(60),
  overdueMaxCount: z.coerce.number().int().min(0).max(12),
});
export type FeeReminderPolicyInput = z.infer<typeof feeReminderPolicySchema>;
export type FeeReminderPolicyView = FeeReminderPolicyInput;

/* -------------------------------------------------------------------------- */
/* A family: choosing a plan                                                  */
/* -------------------------------------------------------------------------- */

export interface FeePlanOption {
  /** A plan's id, or INSTALLMENTS / PAY_IN_FULL for the standard's own. */
  id: string;
  name: string;
  installments: Array<{ label: string; dueDate: string; amountInPaise: number }>;
  /** Pay in full: what paying the year at once saves. */
  discountInPaise?: number;
}

export interface FeePlanChoice {
  academicYearId: string;
  academicYearName: string;
  /** The year's fees for this child, after concessions. */
  yearInPaise: number;
  paidInPaise: number;
  remainingInPaise: number;
  current: {
    planId: string;
    planName: string;
    chosenAt: string;
    /** Chosen by the family rather than set by the office. */
    byFamily: boolean;
  } | null;
  /** Whether this family may choose now. */
  canChoose: boolean;
  /** Why not, in words for the screen. */
  reason: string | null;
  options: FeePlanOption[];
}

/**
 * Paying by the standard's own installments, or the whole year at once. Sent
 * where a plan's id would be, so an app that lists options and sends back the
 * one tapped works for both.
 */
export const FEE_OPTIONS = ['INSTALLMENTS', 'PAY_IN_FULL'] as const;
export type FeeOption = (typeof FEE_OPTIONS)[number];

export const chooseFeePlanSchema = z.object({
  academicYearId: idSchema,
  planId: z.union([z.enum(FEE_OPTIONS), idSchema]),
});
export type ChooseFeePlanInput = z.infer<typeof chooseFeePlanSchema>;

/* -------------------------------------------------------------------------- */
/* The office: a standard's installments and pay-in-full discount             */
/* -------------------------------------------------------------------------- */

export const structureInstallmentSchema = z.object({
  dueDate: z.coerce.date(),
  amountInPaise: z.coerce.number().int().min(1, 'Each installment needs an amount'),
});

export const payInFullSchema = z
  .object({
    enabled: z.boolean(),
    discountKind: z.enum(['FIXED', 'PERCENT']),
    /** Paise for FIXED, 0-100 for PERCENT. */
    discountValue: z.coerce.number().int().min(0),
  })
  .refine((p) => p.discountKind !== 'PERCENT' || p.discountValue <= 100, {
    path: ['discountValue'],
    message: 'A percentage discount cannot be more than 100',
  });
export type PayInFullInput = z.infer<typeof payInFullSchema>;

/* -------------------------------------------------------------------------- */
/* The school's bank account and UPI ID                                       */
/* -------------------------------------------------------------------------- */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const paymentDetailsSchema = z
  .object({
    bankEnabled: z.boolean(),
    bankAccountName: optionalText(120),
    bankAccountNo: optionalText(40),
    bankIfsc: optionalText(20).transform((value) => (value ? value.toUpperCase() : null)),
    bankName: optionalText(120),
    upiEnabled: z.boolean(),
    upiId: optionalText(100),
    upiName: optionalText(120),
  })
  .superRefine((details, ctx) => {
    if (details.bankEnabled) {
      if (!details.bankAccountNo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankAccountNo'],
          message: 'Enter the account number',
        });
      }
      if (!details.bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(details.bankIfsc)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankIfsc'],
          message: 'Enter the 11-character IFSC, like HDFC0001234',
        });
      }
    }
    if (details.upiEnabled && (!details.upiId || !/^[\w.-]+@[\w.-]+$/.test(details.upiId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upiId'],
        message: 'Enter the UPI ID, like school@okhdfc',
      });
    }
  });
export type PaymentDetailsInput = z.infer<typeof paymentDetailsSchema>;
export type PaymentDetailsView = PaymentDetailsInput;

/* -------------------------------------------------------------------------- */
/* A family's proof of payment                                                */
/* -------------------------------------------------------------------------- */

export const PROOF_METHODS = ['UPI', 'BANK_TRANSFER'] as const;
export type ProofMethod = (typeof PROOF_METHODS)[number];

const proofCommon = {
  method: z.enum(PROOF_METHODS),
  reference: z.string().trim().max(80).nullish(),
  screenshotFileId: idSchema,
};

/** The amount is never the family's to type: it is what is owed. */
export const submitPaymentProofSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('INSTALLMENT'), invoiceId: idSchema, ...proofCommon }),
  z.object({ kind: z.literal('PAY_IN_FULL'), ...proofCommon }),
]);
export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

export const approvePaymentProofSchema = z.object({
  /** What the screenshot shows, when it is not what was owed. */
  amountInPaise: z.coerce.number().int().min(1).optional(),
});
export type ApprovePaymentProofInput = z.infer<typeof approvePaymentProofSchema>;

export const rejectPaymentProofSchema = z.object({
  reason: z.string().trim().min(3, 'Tell the family why').max(200),
});
export type RejectPaymentProofInput = z.infer<typeof rejectPaymentProofSchema>;

export type PaymentProofStatus = 'WAITING' | 'APPROVED' | 'REJECTED';

export interface PaymentProofView {
  id: string;
  kind: 'INSTALLMENT' | 'PAY_IN_FULL';
  status: PaymentProofStatus;
  invoiceId: string | null;
  /** "Installment 2" or "Full year", for the screen. */
  label: string;
  amountInPaise: number;
  method: ProofMethod;
  reference: string | null;
  screenshotFileId: string;
  rejectReason: string | null;
  receiptNo: string | null;
  paymentId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  student: { id: string; name: string; admissionNo: string; classroomLabel: string | null };
}

/** What a family needs to pay: where to, what is waiting, and the full-year offer. */
export interface FeePaymentInfo {
  details: {
    bank: {
      accountName: string | null;
      accountNo: string;
      ifsc: string;
      bankName: string | null;
    } | null;
    upi: { id: string; name: string | null } | null;
  };
  payInFull: {
    available: boolean;
    amountInPaise: number;
    discountInPaise: number;
    /** Why not, in words for the screen. */
    reason: string | null;
  };
  proofs: PaymentProofView[];
}

/* -------------------------------------------------------------------------- */
/* The office: mark the year as fully paid                                    */
/* -------------------------------------------------------------------------- */

export const settleFeesSchema = z.object({
  amountInPaise: z.coerce.number().int().min(1, 'Enter the amount received'),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'ONLINE']),
  paidOn: z.coerce.date(),
  reference: z.string().trim().max(80).nullish(),
});
export type SettleFeesInput = z.infer<typeof settleFeesSchema>;

/* -------------------------------------------------------------------------- */
/* A family: the ledger and one installment                                   */
/* -------------------------------------------------------------------------- */

export interface FeeLedgerEntry {
  id: string;
  invoiceNo: string;
  periodLabel: string;
  academicYearId: string;
  academicYearName: string;
  dueDate: string;
  netInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  status: string;
  state: InstallmentState;
  overdue: boolean;
}

export interface FeeInvoiceDetail {
  id: string;
  invoiceNo: string;
  periodLabel: string;
  academicYearId: string;
  academicYearName: string;
  issuedOn: string;
  dueDate: string;
  status: string;
  state: InstallmentState;
  grossInPaise: number;
  discountInPaise: number;
  netInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  lines: Array<{ description: string; amountInPaise: number; discountInPaise: number }>;
  /** Money actually recorded against this installment. */
  payments: Array<{
    id: string;
    receiptNo: string;
    paidOn: string;
    method: string;
    reference: string | null;
    /** The part of the payment that went to this installment. */
    amountInPaise: number;
    status: string;
  }>;
  plan: { name: string; position: number; count: number } | null;
}

/* -------------------------------------------------------------------------- */
/* The office: following up unpaid installments                               */
/* -------------------------------------------------------------------------- */

export const FEE_FOLLOW_UP_OUTCOMES = [
  'REACHED',
  'NO_ANSWER',
  'PROMISED_PAYMENT',
  'REQUESTED_TIME',
  'WRONG_NUMBER',
  'OTHER',
] as const;
export type FeeFollowUpOutcome = (typeof FEE_FOLLOW_UP_OUTCOMES)[number];

export const logFeeFollowUpSchema = z.object({
  invoiceId: idSchema,
  /** When the family was contacted, if they were; null for a reminder only. */
  contactedAt: z.coerce.date().nullish(),
  outcome: z.enum(FEE_FOLLOW_UP_OUTCOMES).nullish(),
  note: z.string().trim().max(300).nullish(),
  followUpOn: z.coerce.date(),
  remindParent: z.boolean().default(true),
});
export type LogFeeFollowUpInput = z.infer<typeof logFeeFollowUpSchema>;

export const closeFeeFollowUpSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
  reason: z.string().trim().max(120).nullish(),
});
export type CloseFeeFollowUpInput = z.infer<typeof closeFeeFollowUpSchema>;

/** Overdue is a pending follow-up whose date has gone by. */
export type FeeFollowUpState = 'PENDING' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';

export interface FeeFollowUpView {
  id: string;
  student: { id: string; name: string; admissionNo: string; classroomLabel: string | null };
  invoice: {
    id: string;
    invoiceNo: string;
    periodLabel: string;
    dueDate: string;
    outstandingInPaise: number;
    state: InstallmentState;
  };
  contactedAt: string | null;
  outcome: FeeFollowUpOutcome | null;
  note: string | null;
  followUpOn: string;
  remindParent: boolean;
  state: FeeFollowUpState;
  reminderSentAt: string | null;
  closedReason: string | null;
  loggedBy: string;
  createdAt: string;
}

/** A family behind on an installment, with what the office needs to call. */
export interface OverdueFamily {
  studentId: string;
  studentName: string;
  admissionNo: string;
  classroomLabel: string | null;
  guardians: Array<{ name: string; phone: string | null; relation: string | null }>;
  invoices: Array<{
    id: string;
    invoiceNo: string;
    periodLabel: string;
    dueDate: string;
    outstandingInPaise: number;
    state: InstallmentState;
  }>;
  outstandingInPaise: number;
  nextFollowUp: { id: string; followUpOn: string } | null;
}
