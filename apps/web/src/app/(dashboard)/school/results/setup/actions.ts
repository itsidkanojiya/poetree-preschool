'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface SetupState {
  error?: string;
  success?: string;
}

function refresh() {
  revalidatePath('/school/results', 'layout');
}

/** Trimmed, and absent rather than empty — an empty string is not a value. */
function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

async function send(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
  success: string,
  failure: string,
): Promise<SetupState> {
  try {
    await apiFetch(path, { method, body, redirectOnAuthFailure: false });
  } catch (error) {
    return { error: errorMessage(error, failure) };
  }
  refresh();
  return { success };
}

/* -------------------------------------------------------------------------- */
/* Grading scale                                                              */
/* -------------------------------------------------------------------------- */

export async function saveScaleAction(
  levels: Array<{ id?: string; label: string; description?: string | null }>,
): Promise<SetupState> {
  return send(
    '/results/scale',
    'PUT',
    { levels },
    'Scale saved. Published report cards keep the grades they were sent with.',
    'Could not save the scale.',
  );
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                      */
/* -------------------------------------------------------------------------- */

export async function createTermAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  return send(
    '/results/terms',
    'POST',
    {
      name: text(formData, 'name'),
      startsOn: text(formData, 'startsOn') ?? null,
      endsOn: text(formData, 'endsOn') ?? null,
    },
    'Term added.',
    'Could not add the term.',
  );
}

export async function updateTermAction(
  id: string,
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  return send(
    `/results/terms/${id}`,
    'PATCH',
    {
      name: text(formData, 'name'),
      startsOn: text(formData, 'startsOn') ?? null,
      endsOn: text(formData, 'endsOn') ?? null,
    },
    'Term saved.',
    'Could not save the term.',
  );
}

export async function setTermActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/results/terms/${id}`, { method: 'PATCH', body: { isActive } });
  refresh();
}

/* -------------------------------------------------------------------------- */
/* What each class level is graded on                                         */
/* -------------------------------------------------------------------------- */

export async function createAreaAction(
  classLevelId: string,
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  return send(
    '/results/areas',
    'POST',
    { classLevelId, group: text(formData, 'group'), name: text(formData, 'name') },
    'Added.',
    'Could not add it.',
  );
}

export async function addAreaPresetAction(
  classLevelId: string,
  preset: 'subjects' | 'development',
): Promise<SetupState> {
  return send(
    '/results/areas/preset',
    'POST',
    { classLevelId, preset },
    preset === 'subjects' ? 'Book subjects added.' : 'Development areas added.',
    'Could not add them.',
  );
}

export async function renameAreaAction(
  id: string,
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  return send(
    `/results/areas/${id}`,
    'PATCH',
    { name: text(formData, 'name') },
    'Renamed.',
    'Could not rename it.',
  );
}

export async function setAreaActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/results/areas/${id}`, { method: 'PATCH', body: { isActive } });
  refresh();
}

/** Swaps two neighbours on the card: `upper` is above `lower` now, and below it after. */
export async function swapAreasAction(
  upper: { id: string; sortOrder: number },
  lower: { id: string; sortOrder: number },
): Promise<void> {
  // Equal orders would swap to the same place and nothing would move; push
  // the upper one a step down instead.
  const upperTo = upper.sortOrder === lower.sortOrder ? lower.sortOrder + 1 : lower.sortOrder;
  await apiFetch(`/results/areas/${upper.id}`, { method: 'PATCH', body: { sortOrder: upperTo } });
  await apiFetch(`/results/areas/${lower.id}`, {
    method: 'PATCH',
    body: { sortOrder: upper.sortOrder },
  });
  refresh();
}
