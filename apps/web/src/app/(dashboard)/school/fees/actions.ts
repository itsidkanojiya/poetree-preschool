'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface FeeState {
  error?: string;
  success?: string;
}

/** Rupees in the form, paise on the wire. Money never travels as a float. */
function toPaise(value: FormDataEntryValue | null): number {
  const rupees = Number(String(value ?? '0'));
  if (!Number.isFinite(rupees) || rupees <= 0) return 0;
  return Math.round(rupees * 100);
}

export async function recordPaymentAction(
  _prev: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const amountInPaise = toPaise(formData.get('amount'));
  const studentId = String(formData.get('studentId') ?? '');

  if (!studentId) return { error: 'Choose a child.' };
  if (amountInPaise <= 0) return { error: 'Enter an amount greater than zero.' };

  let result: { receiptNo: string; allocated: number; unallocated: number };

  try {
    result = await apiFetch('/fees/payments', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        studentId,
        amountInPaise,
        method: String(formData.get('method') ?? 'CASH'),
        paidOn: String(formData.get('paidOn') ?? new Date().toISOString().slice(0, 10)),
        reference: String(formData.get('reference') ?? '').trim() || undefined,
        note: String(formData.get('note') ?? '').trim() || undefined,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not record the payment.') };
  }

  revalidatePath('/school/fees');

  // Money beyond what is owed is surfaced, never silently absorbed.
  const extra =
    result.unallocated > 0
      ? ` ₹${(result.unallocated / 100).toLocaleString('en-IN')} is unallocated — it will settle the next invoice.`
      : '';

  return { success: `Receipt ${result.receiptNo} issued.${extra}` };
}

export async function generateInvoicesAction(
  _prev: FeeState,
  formData: FormData,
): Promise<FeeState> {
  let result: { created: number; skipped: number; totalBilledInPaise: number };

  try {
    result = await apiFetch('/fees/invoices/generate', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        academicYearId: String(formData.get('academicYearId') ?? ''),
        periodLabel: String(formData.get('periodLabel') ?? '').trim(),
        dueDate: String(formData.get('dueDate') ?? ''),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not generate invoices.') };
  }

  revalidatePath('/school/fees');

  // Skipped means "already invoiced for this period" — generation is idempotent,
  // so re-running is safe and the count proves it.
  return {
    success:
      `${result.created} invoice(s) raised for ₹${(result.totalBilledInPaise / 100).toLocaleString('en-IN')}.` +
      (result.skipped > 0 ? ` ${result.skipped} already had one and were left alone.` : ''),
  };
}
