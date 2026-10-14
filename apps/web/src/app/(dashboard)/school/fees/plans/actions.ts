'use server';

import { revalidatePath } from 'next/cache';
import type { FeeReminderPolicyInput, SaveFeePlanInput } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { problem } from '../problem';

export interface PlanState {
  error?: string;
  success?: string;
}

/**
 * A plan as the form sends it: SaveFeePlanInput, except that due dates travel
 * as the YYYY-MM-DD the date inputs hold. The API reads them as dates.
 */
export type PlanBody = Omit<SaveFeePlanInput, 'installments'> & {
  installments: Array<{ label: string; dueDate: string; weight: number }>;
};

async function save(planId: string | null, body: PlanBody): Promise<PlanState | null> {
  try {
    await apiFetch(planId ? `/fees/plans/${planId}` : '/fees/plans', {
      method: planId ? 'PUT' : 'POST',
      redirectOnAuthFailure: false,
      body,
    });
  } catch (error) {
    return { error: problem(error, 'Could not save the plan.') };
  }
  revalidatePath('/school/fees/plans');
  return null;
}

/** Adds a plan, or saves one being edited. */
export async function savePlanAction(planId: string | null, body: PlanBody): Promise<PlanState> {
  return (await save(planId, body)) ?? { success: planId ? 'Plan saved.' : `${body.name} added.` };
}

/**
 * Offers a plan to families again, or stops offering it. The whole plan goes
 * back unchanged apart from that, so a plan families already pay by can be
 * switched off: its installments are not touched.
 */
export async function switchPlanAction(planId: string, body: PlanBody): Promise<PlanState> {
  return (
    (await save(planId, body)) ?? {
      success: body.isEnabled
        ? `${body.name} is offered to families again.`
        : `${body.name} is switched off. Families already on it stay on it.`,
    }
  );
}

/** Only a plan nobody is on; the API refuses one in use. */
export async function deletePlanAction(planId: string): Promise<PlanState> {
  try {
    await apiFetch(`/fees/plans/${planId}`, { method: 'DELETE', redirectOnAuthFailure: false });
  } catch (error) {
    return { error: problem(error, 'Could not delete the plan.') };
  }
  revalidatePath('/school/fees/plans');
  return { success: 'Plan deleted.' };
}

/** When the school reminds families about an installment. */
export async function saveRemindersAction(policy: FeeReminderPolicyInput): Promise<PlanState> {
  try {
    await apiFetch('/fees/reminders', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: policy,
    });
  } catch (error) {
    return { error: problem(error, 'Could not save the reminders.') };
  }
  revalidatePath('/school/fees/plans');
  return { success: 'Reminders saved.' };
}
