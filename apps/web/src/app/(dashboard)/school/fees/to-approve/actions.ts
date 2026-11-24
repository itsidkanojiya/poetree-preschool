'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';

export interface ReviewState {
  error?: string;
  success?: string;
  done?: boolean;
}

const refresh = () => {
  revalidatePath('/school/fees/to-approve');
  revalidatePath('/school/fees');
};

/** Records the payment, with a receipt, for what the screenshot shows. */
export async function approveProofAction(
  proofId: string,
  who: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  if (!ID.test(proofId)) return { error: 'Not a payment.' };
  const rupees = Number(String(formData.get('amount') ?? '').trim());
  if (!Number.isFinite(rupees) || rupees <= 0) return { error: 'Enter the amount received.' };

  let receiptNo: string;
  try {
    const approved = await apiFetch<{ receiptNo: string }>(`/fees/proofs/${proofId}/approve`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { amountInPaise: Math.round(rupees * 100) },
    });
    receiptNo = approved.receiptNo;
  } catch (error) {
    return { error: errorMessage(error, 'Could not approve that payment.') };
  }
  refresh();
  // Said by the page: this payment's row leaves the list once approved.
  redirect(
    `/school/fees/to-approve?done=approved&who=${encodeURIComponent(`${who} · ${receiptNo}`)}`,
  );
}

/** Sends it back, with the reason the family will read. */
export async function rejectProofAction(
  proofId: string,
  who: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  if (!ID.test(proofId)) return { error: 'Not a payment.' };
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Tell the family why, so they can send it again.' };
  try {
    await apiFetch(`/fees/proofs/${proofId}/reject`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { reason },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not reject that payment.') };
  }
  refresh();
  redirect(`/school/fees/to-approve?done=rejected&who=${encodeURIComponent(who)}`);
}
