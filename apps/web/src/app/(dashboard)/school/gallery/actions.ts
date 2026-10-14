'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { GalleryDriveMoveResult, GalleryEventDetail } from '@poetree/shared';
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
 * One photograph, already shrunk in the browser, and the small copy made of
 * it for grids, into an event — and from there into the school's Google Drive
 * when it has connected one.
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
  const thumb = formData.get('thumb');

  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const body = new FormData();
    body.append('photo', file);
    if (thumb instanceof File && thumb.size > 0) body.append('thumb', thumb);

    const response = await fetch(`${API_BASE_URL}/gallery/events/${eventId}/photos/upload`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
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
    return { error: errorMessage(error, 'Upload failed') };
  }

  return {};
}

/**
 * A video by its YouTube link. The school uploads it to its own channel —
 * Unlisted, so only people with the link find it — and pastes the link here.
 */
export async function addVideoAction(
  eventId: string,
  _prev: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  try {
    await apiFetch(`/gallery/events/${eventId}/videos`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        url: String(formData.get('url') ?? '').trim(),
        caption: String(formData.get('caption') ?? '').trim() || null,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the video.') };
  }

  revalidatePath(`/school/gallery/${eventId}`);
  revalidatePath('/school/gallery');
  return { success: 'Video added.' };
}

export async function removeVideoAction(eventId: string, videoId: string): Promise<void> {
  await apiFetch(`/gallery/videos/${videoId}`, { method: 'DELETE' });
  revalidatePath(`/school/gallery/${eventId}`);
  revalidatePath('/school/gallery');
}

/**
 * Off to Google's page, to let the gallery keep photos in the school's own
 * Drive. Google sends the office back to drive/callback.
 */
export async function connectDriveAction(): Promise<GalleryState> {
  let url: string;
  try {
    ({ url } = await apiFetch<{ url: string }>('/gallery/drive/connect', {
      method: 'POST',
      redirectOnAuthFailure: false,
    }));
  } catch (error) {
    return { error: errorMessage(error, 'Could not start connecting Google Drive.') };
  }
  redirect(url);
}

export async function disconnectDriveAction(): Promise<void> {
  await apiFetch('/gallery/drive', { method: 'DELETE' });
  revalidatePath('/school/gallery');
}

/** One step of moving the photos already on this server into Drive. */
export async function moveToDriveAction(
  after: string | null,
): Promise<{ result?: GalleryDriveMoveResult; error?: string }> {
  try {
    const result = await apiFetch<GalleryDriveMoveResult>('/gallery/drive/move', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: after ? { after } : {},
    });
    return { result };
  } catch (error) {
    return { error: errorMessage(error, 'Could not move the photos.') };
  }
}

/** Once a batch is done, so the grid shows everything that went up. */
export async function refreshEventAction(eventId: string): Promise<void> {
  revalidatePath(`/school/gallery/${eventId}`);
  revalidatePath('/school/gallery');
}
