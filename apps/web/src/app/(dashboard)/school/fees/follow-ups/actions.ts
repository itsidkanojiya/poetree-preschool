'use server';

import { revalidatePath } from 'next/cache';
import type { FeeFollowUpOutcome, FeeFollowUpView } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatDay } from '../calendar';
import { problem } from '../problem';

export interface FollowUpState {
  error?: string;
  success?: string;
}

/**
 * A follow-up as the form sends it. The contact time is already an instant,
 * worked out in the browser from what its clock showed, so the server's own
 * time zone never shifts it.
 */
export interface FollowUpBody {
  invoiceId: string;
  contactedAt: string | null;
  outcome: FeeFollowUpOutcome | null;
  note: string | null;
  /** YYYY-MM-DD. */
  followUpOn: string;
  remindParent: boolean;
}

export async function logFollowUpAction(body: FollowUpBody): Promise<FollowUpState> {
  let saved: FeeFollowUpView;
  try {
    saved = await apiFetch<FeeFollowUpView>('/fees/follow-ups', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body,
    });
  } catch (error) {
    return { error: problem(error, 'Could not save the follow-up.') };
  }

  revalidatePath('/school/fees/follow-ups');
  return {
    success: `Follow-up for ${saved.student.name} on ${formatDay(saved.followUpOn)} saved.${
      saved.remindParent ? ' The family will be reminded that day.' : ''
    }`,
  };
}

export async function closeFollowUpAction(
  followUpId: string,
  status: 'COMPLETED' | 'CANCELLED',
): Promise<FollowUpState> {
  try {
    await apiFetch(`/fees/follow-ups/${followUpId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { status },
    });
  } catch (error) {
    return { error: problem(error, 'Could not close the follow-up.') };
  }

  revalidatePath('/school/fees/follow-ups');
  return { success: status === 'COMPLETED' ? 'Marked done.' : 'Follow-up cancelled.' };
}
