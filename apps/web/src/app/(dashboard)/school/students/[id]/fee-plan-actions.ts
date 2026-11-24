'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FeePlanChoice } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { ID } from '@/lib/document-proxy';
import { problem } from '../../fees/problem';

export interface FeePlanState {
  error?: string;
  success?: string;
}

/**
 * Puts a child on a plan, or moves them to another. The API keeps paid and
 * part-paid installments, cancels unpaid ones and bills the rest again over
 * the new plan's installments still to come.
 */
export async function changeFeePlanAction(
  studentId: string,
  academicYearId: string,
  planId: string,
): Promise<FeePlanState> {
  let choice: FeePlanChoice;
  try {
    choice = await apiFetch<FeePlanChoice>(`/fees/students/${studentId}/plan`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { academicYearId, planId },
    });
  } catch (error) {
    return { error: problem(error, 'Could not move the child to that plan.') };
  }

  revalidatePath(`/school/students/${studentId}`);
  // The balance owed and what is overdue may both have changed.
  revalidatePath('/school/fees');
  return {
    success: `Now on the ${choice.current?.planName ?? 'new'} plan. Unpaid installments were billed again.`,
  };
}

/**
 * Mark as fully paid: the money received is recorded with a receipt, and every
 * installment still open this year is closed — no more reminders.
 */
export async function settleFeesAction(
  studentId: string,
  _prev: FeePlanState,
  formData: FormData,
): Promise<FeePlanState & { done?: boolean }> {
  if (!ID.test(studentId)) return { error: 'Not a child.' };
  const rupees = Number(String(formData.get('amount') ?? '').trim());
  if (!Number.isFinite(rupees) || rupees <= 0) return { error: 'Enter the amount received.' };
  const paidOn = String(formData.get('paidOn') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: 'Enter the date it was paid.' };

  let receiptNo: string;
  try {
    const settled = await apiFetch<{ receiptNo: string }>(`/fees/students/${studentId}/settle`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        amountInPaise: Math.round(rupees * 100),
        method: String(formData.get('method') ?? 'CASH'),
        paidOn,
        reference: String(formData.get('reference') ?? '').trim() || null,
      },
    });
    receiptNo = settled.receiptNo;
  } catch (error) {
    return { error: problem(error, 'Could not mark the fees as paid.') };
  }

  revalidatePath(`/school/students/${studentId}`);
  revalidatePath('/school/fees');
  // Said by the page: the button goes once nothing is owed.
  redirect(
    `/school/students/${studentId}?tab=fees&done=settled&who=${encodeURIComponent(receiptNo)}`,
  );
}
