'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface StreamState {
  error?: string;
  success?: string;
}

export async function createPostAction(
  _prev: StreamState,
  formData: FormData,
): Promise<StreamState> {
  const classroomId = String(formData.get('classroomId') ?? '');
  const title = String(formData.get('title') ?? '').trim();

  if (!classroomId) return { error: 'Choose a class.' };
  if (title.length < 2) return { error: 'Give the post a title.' };

  try {
    await apiFetch('/classroom-posts', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        classroomId,
        type: String(formData.get('type') ?? 'ANNOUNCEMENT'),
        title,
        body: String(formData.get('body') ?? '').trim() || undefined,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not post to the class.') };
  }

  revalidatePath('/teacher/stream');
  return { success: 'Posted. Parents of this class can see it now.' };
}
