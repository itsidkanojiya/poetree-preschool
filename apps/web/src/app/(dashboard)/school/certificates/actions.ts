'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CertificateDetail } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface CertificateState {
  error?: string;
  success?: string;
}

/** Trimmed, and absent rather than empty — an empty string is not a value. */
function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

function refresh(id?: string) {
  revalidatePath('/school/certificates');
  if (id) revalidatePath(`/school/certificates/${id}`);
}

/** Written as a draft with nobody on it yet; the children are picked next. */
export async function createCertificateAction(
  _prev: CertificateState,
  formData: FormData,
): Promise<CertificateState> {
  let created: CertificateDetail;
  try {
    created = await apiFetch<CertificateDetail>('/certificates', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        title: text(formData, 'title'),
        body: text(formData, 'body') ?? '',
        design: text(formData, 'design'),
        issuedOn: text(formData, 'issuedOn'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the certificate.') };
  }
  refresh();
  redirect(`/school/certificates/${created.id}`);
}

export async function updateCertificateAction(
  id: string,
  _prev: CertificateState,
  formData: FormData,
): Promise<CertificateState> {
  try {
    await apiFetch(`/certificates/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        title: text(formData, 'title'),
        body: text(formData, 'body') ?? '',
        design: text(formData, 'design'),
        issuedOn: text(formData, 'issuedOn'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save.') };
  }
  refresh(id);
  return { success: 'Saved.' };
}

/**
 * The children ticked in the class on screen, plus everyone already chosen
 * from other classes — picking Nursery B must not undo Nursery A.
 */
export async function setRecipientsAction(
  id: string,
  _prev: CertificateState,
  formData: FormData,
): Promise<CertificateState> {
  const keep = formData.getAll('keep').map(String);
  const picked = formData.getAll('studentId').map(String);
  const studentIds = Array.from(new Set([...keep, ...picked]));

  try {
    await apiFetch(`/certificates/${id}/recipients`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { studentIds },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the children.') };
  }
  refresh(id);
  return {
    success: `${studentIds.length} ${studentIds.length === 1 ? 'child' : 'children'} chosen.`,
  };
}

export async function issueCertificateAction(id: string): Promise<CertificateState> {
  try {
    await apiFetch(`/certificates/${id}/issue`, { method: 'POST', redirectOnAuthFailure: false });
  } catch (error) {
    return { error: errorMessage(error, 'Could not issue the certificate.') };
  }
  refresh(id);
  return { success: 'Issued. Each family has been told.' };
}

export async function deleteCertificateAction(id: string): Promise<void> {
  await apiFetch(`/certificates/${id}`, { method: 'DELETE' });
  refresh();
  redirect('/school/certificates');
}

export async function revokeAwardAction(certificateId: string, awardId: string): Promise<void> {
  await apiFetch(`/certificates/awards/${awardId}/revoke`, { method: 'POST' });
  refresh(certificateId);
}
