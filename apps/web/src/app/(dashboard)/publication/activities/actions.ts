'use server';

import { revalidatePath } from 'next/cache';
import { activityContentSchema } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface ActivityState {
  error?: string;
  success?: string;
}

/**
 * Content comes in as JSON text.
 *
 * Choice and card activities get real fields in the form; tracing does not,
 * because its strokes are normalised coordinate paths and a textarea is an
 * honest way to paste one until there is a drawing surface here. Either way it
 * is parsed against the same contract the API and the app use, so a typo is
 * caught on this screen rather than by a child.
 */
function readContent(raw: string): { content?: unknown; error?: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'The content is not valid JSON.' };
  }

  const checked = activityContentSchema.safeParse(parsed);
  if (!checked.success) {
    const first = checked.error.issues[0];
    return {
      error: first
        ? `${first.path.join('.') || 'content'}: ${first.message}`
        : 'The content does not match what the app can play.',
    };
  }

  return { content: checked.data };
}

export async function createActivityAction(
  _prev: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  const { content, error } = readContent(String(formData.get('content') ?? ''));
  if (error) return { error };

  const classLevelId = String(formData.get('classLevelId') ?? '').trim();
  const bookId = String(formData.get('bookId') ?? '').trim();

  try {
    await apiFetch('/publication/activities', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        code: String(formData.get('code') ?? '').trim().toUpperCase(),
        title: String(formData.get('title') ?? '').trim(),
        type: String(formData.get('type') ?? ''),
        skillId: String(formData.get('skillId') ?? ''),
        classLevelId: classLevelId === '' ? null : classLevelId,
        bookId: bookId === '' ? null : bookId,
        content,
      },
    });
  } catch (e) {
    return { error: errorMessage(e, 'Could not save the activity.') };
  }

  revalidatePath('/publication/activities');
  return { success: 'Added to the catalogue. Every school can play it now.' };
}

export async function updateActivityAction(
  _prev: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('content') ?? '').trim();

  const body: Record<string, unknown> = {
    title: String(formData.get('title') ?? '').trim(),
    skillId: String(formData.get('skillId') ?? ''),
  };

  const classLevelId = String(formData.get('classLevelId') ?? '').trim();
  body.classLevelId = classLevelId === '' ? null : classLevelId;

  const bookId = String(formData.get('bookId') ?? '').trim();
  body.bookId = bookId === '' ? null : bookId;

  if (raw !== '') {
    const { content, error } = readContent(raw);
    if (error) return { error };
    body.content = content;
  }

  try {
    await apiFetch(`/publication/activities/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body,
    });
  } catch (e) {
    return { error: errorMessage(e, 'Could not save the activity.') };
  }

  revalidatePath('/publication/activities');
  revalidatePath(`/publication/activities/${id}`);
  return { success: 'Saved.' };
}

/**
 * Retiring, never deleting.
 *
 * Every attempt a child has made points at this row, and those attempts are the
 * evidence behind the mastery figures their parents have already been shown.
 */
export async function setActivityActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/activities/${id}`, { method: 'PATCH', body: { isActive } });
  revalidatePath('/publication/activities');
  revalidatePath(`/publication/activities/${id}`);
}
