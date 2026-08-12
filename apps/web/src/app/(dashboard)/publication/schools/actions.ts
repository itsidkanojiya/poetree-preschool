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
        code: text(formData, 'code'),
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
  // Straight to the detail page, which is where the plan and the admin are set up.
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
  return {
    success: `School suspended. ${result.affectedUsers} user(s) blocked, ${result.revokedSessions} live session(s) ended.`,
  };
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
  return { success: 'School reactivated. Its users can sign in again.' };
}

/**
 * Uploads a logo and points the school at it.
 *
 * Two calls, like every other attachment in the system: POST /files owns the
 * sniffing and the size caps, and this only records which file is the badge.
 * Done from the server so the token stays in its httpOnly cookie.
 */
export async function uploadSchoolLogoAction(
  schoolId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get('logo');

  // An empty submit means "take it away", which is a real thing to want.
  if (!(file instanceof File) || file.size === 0) {
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

  let fileId: string;

  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const upload = new FormData();
    upload.append('file', file);

    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: upload,
      cache: 'no-store',
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: { message?: string } }).error.message ?? 'Upload failed')
          : 'Upload failed';
      return { error: message };
    }

    fileId = (data as { id: string }).id;
  } catch (error) {
    return { error: errorMessage(error, 'Could not upload the logo.') };
  }

  try {
    await apiFetch(`/publication/schools/${schoolId}/logo`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { fileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'The file uploaded but would not attach.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: 'Saved. It will show on the app and on their sign-in screen.' };
}
