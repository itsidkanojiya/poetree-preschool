'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface PaymentDetailsState {
  error?: string;
  success?: string;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim() || null;

/** Where families send money: the bank account, the UPI ID, or both. */
export async function savePaymentDetailsAction(
  _prev: PaymentDetailsState,
  formData: FormData,
): Promise<PaymentDetailsState> {
  const body = {
    bankEnabled: formData.get('bankEnabled') === 'on',
    bankAccountName: text(formData, 'bankAccountName'),
    bankAccountNo: text(formData, 'bankAccountNo'),
    bankIfsc: text(formData, 'bankIfsc'),
    bankName: text(formData, 'bankName'),
    upiEnabled: formData.get('upiEnabled') === 'on',
    upiId: text(formData, 'upiId'),
    upiName: text(formData, 'upiName'),
  };
  if (!body.bankEnabled && !body.upiEnabled) {
    return { error: 'Switch on bank transfer, UPI or both, so families know where to pay.' };
  }
  try {
    await apiFetch('/fees/payment-details', { method: 'PUT', redirectOnAuthFailure: false, body });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the payment details.') };
  }
  revalidatePath('/school/fees/payment-details');
  return { success: 'Saved. Families see these in the app when they pay.' };
}
