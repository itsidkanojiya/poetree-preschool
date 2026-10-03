'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface TracingState {
  error?: string;
  success?: string;
}

function refresh() {
  revalidatePath('/publication/tracing');
}

/** On or off in every school's app. */
export async function setTracingEnabledAction(enabled: boolean): Promise<void> {
  await apiFetch('/publication/tracing/settings', { method: 'PUT', body: { enabled } });
  refresh();
}

export async function setCategoryActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/tracing/categories/${id}`, { method: 'PATCH', body: { isActive } });
  refresh();
}

export async function renameCategoryAction(
  id: string,
  _prev: TracingState,
  formData: FormData,
): Promise<TracingState> {
  try {
    await apiFetch(`/publication/tracing/categories/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim() || undefined,
        label: String(formData.get('label') ?? '').trim() || undefined,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save.') };
  }
  refresh();
  return { success: 'Saved.' };
}

/** The video for one letter. An empty box takes it off. */
export async function setItemVideoAction(
  id: string,
  _prev: TracingState,
  formData: FormData,
): Promise<TracingState> {
  const videoUrl = String(formData.get('videoUrl') ?? '').trim();
  try {
    await apiFetch(`/publication/tracing/items/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { videoUrl },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the video.') };
  }
  refresh();
  return { success: videoUrl ? 'Video saved.' : 'Video taken off.' };
}

export async function setItemActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/tracing/items/${id}`, { method: 'PATCH', body: { isActive } });
  refresh();
}

export async function addItemAction(
  categoryId: string,
  _prev: TracingState,
  formData: FormData,
): Promise<TracingState> {
  const glyph = String(formData.get('glyph') ?? '').trim();
  const videoUrl = String(formData.get('videoUrl') ?? '').trim();
  try {
    await apiFetch(`/publication/tracing/categories/${categoryId}/items`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { glyph, ...(videoUrl ? { videoUrl } : {}) },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add it.') };
  }
  refresh();
  return { success: `“${glyph}” added.` };
}
