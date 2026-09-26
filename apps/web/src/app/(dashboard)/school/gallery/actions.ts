'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { GalleryEventDetail } from '@poetree/shared';
import { API_BASE_URL, apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

export interface GalleryState {
  error?: string;
  success?: string;
}

/** Who may see an event, as the form sends it. */
function audience(formData: FormData): { visibleToAll: boolean; classroomIds: string[] } {
  const visibleToAll = formData.get('visibleToAll') === 'on';
  return {
    visibleToAll,
    classroomIds: visibleToAll ? [] : formData.getAll('classroomIds').map(String),
  };
}

export async function createEventAction(
  _prev: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  let created: GalleryEventDetail;

  try {
    created = await apiFetch<GalleryEventDetail>('/gallery/events', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        eventDate: String(formData.get('eventDate') ?? '') || null,
        description: String(formData.get('description') ?? '').trim() || null,
        ...audience(formData),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the event.') };
  }

  revalidatePath('/school/gallery');
  // Straight to the event: the next thing anybody does is add the photos.
  redirect(`/school/gallery/${created.id}`);
}

export async function updateEventAction(
  eventId: string,
  _prev: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  try {
    await apiFetch(`/gallery/events/${eventId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        eventDate: String(formData.get('eventDate') ?? '') || null,
        description: String(formData.get('description') ?? '').trim() || null,
        ...audience(formData),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the event.') };
  }

  revalidatePath('/school/gallery');
  revalidatePath(`/school/gallery/${eventId}`);
  return { success: 'Saved.' };
}

export async function deleteEventAction(eventId: string): Promise<void> {
  await apiFetch(`/gallery/events/${eventId}`, { method: 'DELETE' });
  revalidatePath('/school/gallery');
  redirect('/school/gallery');
}

export async function removePhotoAction(eventId: string, photoId: string): Promise<void> {
  await apiFetch(`/gallery/photos/${photoId}`, { method: 'DELETE' });
  revalidatePath(`/school/gallery/${eventId}`);
}

/**
 * One photograph, already shrunk in the browser, into an event.
 *
 * One at a time rather than a batch: the page shows progress per photo, and a
 * failure on the ninth of forty should cost the ninth, not all forty.
 */
export async function uploadPhotoAction(
  eventId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: 'No photo was sent.' };

  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const body = new FormData();
    body.append('file', file);

    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
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

    await apiFetch(`/gallery/events/${eventId}/photos`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { fileIds: [(data as { id: string }).id] },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Upload failed') };
  }

  return {};
}

/** Once a batch is done, so the grid shows everything that went up. */
export async function refreshEventAction(eventId: string): Promise<void> {
  revalidatePath(`/school/gallery/${eventId}`);
  revalidatePath('/school/gallery');
}
