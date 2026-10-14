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
  id: string;
  name: string;
  installments: Array<{ label: string; dueDate: string; amountInPaise: number }>;
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

export const chooseFeePlanSchema = z.object({
  academicYearId: idSchema,
  planId: idSchema,
});
export type ChooseFeePlanInput = z.infer<typeof chooseFeePlanSchema>;

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
