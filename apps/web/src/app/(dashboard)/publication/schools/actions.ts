'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SchoolSummary } from '@poetree/shared';
import { cookies } from 'next/headers';
import { API_BASE_URL, apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

export interface ActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

export async function createSchoolAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created: SchoolSummary;

  try {
    created = await apiFetch<SchoolSummary>('/publication/schools', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        // Absent rather than empty: the API generates one from the name, and
        // an empty string would fail validation instead.
        code: text(formData, 'code'),
        organisationId: text(formData, 'organisationId') ?? null,
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        city: text(formData, 'city'),
        state: text(formData, 'state'),
        addressLine1: text(formData, 'addressLine1'),
        principalName: text(formData, 'principalName'),
        primaryColor: text(formData, 'primaryColor'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the school.') };
  }

  revalidatePath('/publication/schools');
  // Straight to the school's page, where the administrator, books and access are set up.
  redirect(`/publication/schools/${created.id}`);
}

export async function updateSchoolAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch(`/publication/schools/${schoolId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        city: text(formData, 'city'),
        state: text(formData, 'state'),
        addressLine1: text(formData, 'addressLine1'),
        principalName: text(formData, 'principalName'),
        primaryColor: text(formData, 'primaryColor'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the school.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: 'School details saved.' };
}

export async function createSchoolAdminAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch(`/publication/schools/${schoolId}/admins`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        password: text(formData, 'password'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the administrator.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: 'School administrator created. Share the password securely.' };
}

export async function assignSubscriptionAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch(`/publication/schools/${schoolId}/subscription`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        planId: text(formData, 'planId'),
        expiresAt: text(formData, 'expiresAt'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not assign the plan.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  revalidatePath('/publication/schools');
  return { success: 'Plan assigned. The school is active.' };
}

/**
 * The switch. Every user of this school is locked out the moment this returns —
 * their live sessions are revoked server-side, not merely expired.
 */
export async function suspendSchoolAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let result: { revokedSessions: number; affectedUsers: number };

  try {
    result = await apiFetch(`/publication/schools/${schoolId}/suspend`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { reason: text(formData, 'reason') },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not suspend the school.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  revalidatePath('/publication/schools');
  // Back to the Access tab with the outcome in the address: the Suspend card
  // is replaced by Restore access the moment this lands, and a message held
  // in its state went with it — so suspending used to say nothing at all.
  redirect(
    `/publication/schools/${schoolId}?tab=access&done=suspended&users=${result.affectedUsers}`,
  );
}

export async function reactivateSchoolAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch(`/publication/schools/${schoolId}/reactivate`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        note: text(formData, 'note'),
        expiresAt: text(formData, 'expiresAt'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not reactivate the school.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  revalidatePath('/publication/schools');
  redirect(`/publication/schools/${schoolId}?tab=access&done=reactivated`);
}

/**
 * Uploads a picture as the school's logo, in one call.
 *
 * Sent from the server so the token stays in its httpOnly cookie. It used to
 * go through POST /files, which files an upload under the caller's own school
 * — and the Super Admin has none, so every logo failed. Choosing nothing is
 * refused here: taking the logo away is its own button now, not an accident
 * of pressing Save with an empty field.
 */
export async function uploadSchoolLogoAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a picture first.' };
  }

  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const upload = new FormData();
    upload.append('file', file);

    const response = await fetch(`${API_BASE_URL}/publication/schools/${schoolId}/logo`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: upload,
      cache: 'no-store',
    });

    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: { message?: string } }).error.message ?? 'Upload failed')
          : 'Upload failed';
      return { error: message };
    }
  } catch (error) {
    return { error: errorMessage(error, 'Could not upload the logo.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: 'Saved. It will show on the app and on their sign-in screen.' };
}

/** Takes the logo away; the app shows the school's initials instead. */
export async function removeSchoolLogoAction(
  schoolId: string,
  _prev: ActionState,
): Promise<ActionState> {
  try {
    await apiFetch(`/publication/schools/${schoolId}/logo`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { fileId: null },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not remove the logo.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: 'Logo removed.' };
}


/**
 * How long a school's access lasts.
 *
 * Clearing the date leaves them on indefinitely; a date in the past locks them
 * out on their next request, which is the quickest way to stop a school that
 * has not paid.
 */
export async function setSchoolValidityAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get('validUntil') ?? '').trim();

  try {
    await apiFetch(`/publication/schools/${schoolId}/validity`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { validUntil: raw === '' ? null : raw },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the validity.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  revalidatePath('/publication/schools');

  return {
    success:
      raw === ''
        ? 'No end date. They stay on until you set one.'
        : new Date(raw).getTime() > Date.now()
          ? 'Saved. They are active until then.'
          : 'Saved. That date has passed, so they are locked out now.',
  };
}

/**
 * Deleting a school for good. The School ID typed in the window is sent as the
 * confirmation, and the API checks it again — a form can be got round, the API
 * cannot.
 */
export async function deleteSchoolAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!/^[a-z0-9]{20,32}$/.test(schoolId)) return { error: 'Not a school.' };
  const confirmCode = text(formData, 'confirmCode');
  if (!confirmCode) return { error: 'Type the School ID to confirm.' };

  let name: string;
  try {
    const deleted = await apiFetch<{ name: string }>(`/publication/schools/${schoolId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
      body: { confirmCode },
    });
    name = deleted.name;
  } catch (error) {
    return { error: errorMessage(error, 'Could not delete the school.') };
  }

  revalidatePath('/publication/schools');
  revalidatePath('/publication');
  redirect(`/publication/schools?deleted=${encodeURIComponent(name)}`);
}
