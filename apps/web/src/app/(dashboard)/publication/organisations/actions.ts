'use server';

import { revalidatePath } from 'next/cache';
import type { OrganisationSummary } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface OrganisationState {
  error?: string;
  success?: string;
}

/** Trimmed, and absent rather than empty — an empty string is not a value. */
function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

/**
 * A customer that runs more than one school.
 *
 * The code may be left blank, and usually is: it is generated from the name,
 * and its branches are then numbered under it — sunrise, sunrise01, sunrise02.
 */
export async function createOrganisationAction(
  _prev: OrganisationState,
  formData: FormData,
): Promise<OrganisationState> {
  let created: OrganisationSummary;

  try {
    created = await apiFetch<OrganisationSummary>('/publication/organisations', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { name: text(formData, 'name'), code: text(formData, 'code') },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the group.') };
  }

  revalidatePath('/publication/organisations');
  return { success: `${created.name} created as “${created.code}”.` };
}

export async function updateOrganisationAction(
  _prev: OrganisationState,
  formData: FormData,
): Promise<OrganisationState> {
  const id = String(formData.get('id') ?? '');

  try {
    await apiFetch(`/publication/organisations/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { name: text(formData, 'name') },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the group.') };
  }

  revalidatePath('/publication/organisations');
  revalidatePath(`/publication/organisations/${id}`);
  return { success: 'Saved.' };
}

/**
 * The group's own administrator — the account that can reach every branch.
 *
 * Created here because nobody inside a group can be the first account in it,
 * exactly as a school's first administrator is created by the publisher.
 */
export async function createOrganisationAdminAction(
  _prev: OrganisationState,
  formData: FormData,
): Promise<OrganisationState> {
  const id = String(formData.get('id') ?? '');

  try {
    await apiFetch(`/publication/organisations/${id}/admins`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'adminName'),
        email: text(formData, 'adminEmail'),
        phone: text(formData, 'adminPhone'),
        password: text(formData, 'adminPassword'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the administrator.') };
  }

  revalidatePath(`/publication/organisations/${id}`);
  return { success: 'Administrator created. They choose a branch when they sign in.' };
}
