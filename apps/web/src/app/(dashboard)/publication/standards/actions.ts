'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface StandardState {
  error?: string;
  success?: string;
}

function optionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createStandardAction(
  _prev: StandardState,
  formData: FormData,
): Promise<StandardState> {
  try {
    await apiFetch('/publication/standards', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        code: String(formData.get('code') ?? '').trim().toUpperCase(),
        name: String(formData.get('name') ?? '').trim(),
        minAgeMonths: optionalNumber(formData, 'minAgeMonths'),
        maxAgeMonths: optionalNumber(formData, 'maxAgeMonths'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the standard.') };
  }

  revalidatePath('/publication/standards');
  return { success: 'Added. Schools can open classes in it now.' };
}

export async function renameStandardAction(
  id: string,
  _prev: StandardState,
  formData: FormData,
): Promise<StandardState> {
  try {
    await apiFetch(`/publication/standards/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        sortOrder: optionalNumber(formData, 'sortOrder') ?? undefined,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  revalidatePath('/publication/standards');
  return { success: 'Saved.' };
}

/**
 * Retiring, never deleting — classrooms, fee structures and a term of
 * attendance all point at a standard.
 */
export async function setStandardActiveAction(id: string, isActive: boolean): Promise<void> {
  if (isActive) {
    await apiFetch(`/publication/standards/${id}`, { method: 'PATCH', body: { isActive: true } });
  } else {
    await apiFetch(`/publication/standards/${id}/retire`, { method: 'POST' });
  }
  revalidatePath('/publication/standards');
}
