'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';
import type { DeleteState } from '@/components/ui/delete-button';

/**
 * The school's permanent deletes. Each id arrives from the browser and goes
 * into an API path, so it is held to the shape of one first; the API decides
 * everything else — whose it is, whether it may go, what goes with it.
 */

const confirmOf = (formData: FormData) => String(formData.get('confirm') ?? '').trim();

async function remove<T>(
  path: string,
  fallback: string,
  body?: unknown,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const value = await apiFetch<T>(path, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
      ...(body ? { body } : {}),
    });
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorMessage(error, fallback) };
  }
}

export async function eraseStudentAction(
  studentId: string,
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!ID.test(studentId)) return { error: 'Not a child on the roll.' };
  const result = await remove<{ name: string }>(
    `/students/${studentId}/permanently`,
    'Could not delete the child.',
    { confirm: confirmOf(formData) },
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/students');
  revalidatePath('/school');
  redirect(`/school/students?done=erased&who=${encodeURIComponent(result.value.name)}`);
}

export async function deletePaymentAction(
  studentId: string,
  paymentId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(studentId) || !ID.test(paymentId)) return { error: 'Not a payment.' };
  const result = await remove(`/fees/payments/${paymentId}`, 'Could not delete the payment.');
  if (!result.ok) return { error: result.error };
  revalidatePath(`/school/students/${studentId}`);
  revalidatePath('/school/fees');
  return { done: true };
}

export async function deleteInvoiceAction(
  studentId: string,
  invoiceId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(studentId) || !ID.test(invoiceId)) return { error: 'Not an invoice.' };
  const result = await remove(`/fees/invoices/${invoiceId}`, 'Could not delete the invoice.');
  if (!result.ok) return { error: result.error };
  revalidatePath(`/school/students/${studentId}`);
  revalidatePath('/school/fees');
  return { done: true };
}

export async function deleteRegistrationAction(
  registrationId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(registrationId)) return { error: 'Not a registration.' };
  const result = await remove(
    `/registrations/${registrationId}`,
    'Could not delete the registration.',
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/registrations');
  return { done: true };
}

export async function deleteClassroomAction(
  classroomId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(classroomId)) return { error: 'Not a classroom.' };
  const result = await remove(`/classrooms/${classroomId}`, 'Could not delete the classroom.');
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/classrooms');
  revalidatePath('/school/timetable');
  return { done: true };
}

export async function deleteNoticeAction(
  noticeId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(noticeId)) return { error: 'Not an announcement.' };
  const result = await remove(`/notices/${noticeId}`, 'Could not delete the announcement.');
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/notices');
  return { done: true };
}

export async function deleteTermAction(termId: string, _prev: DeleteState): Promise<DeleteState> {
  if (!ID.test(termId)) return { error: 'Not a term.' };
  const result = await remove(`/results/terms/${termId}`, 'Could not delete the term.');
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/results');
  revalidatePath('/school/results/setup');
  return { done: true };
}

export async function resetProgressAction(
  studentId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(studentId)) return { error: 'Not a child.' };
  const result = await remove(`/progress/students/${studentId}`, 'Could not reset progress.');
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/progress');
  return { done: true };
}

export async function eraseCertificateAction(
  certificateId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(certificateId)) return { error: 'Not a certificate.' };
  const result = await remove(
    `/certificates/${certificateId}`,
    'Could not delete the certificate.',
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/school/certificates');
  redirect('/school/certificates');
}
