'use server';

import { revalidatePath } from 'next/cache';
import type { FeePlanChoice } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
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
