'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface NoticeState {
  error?: string;
  success?: string;
}

export async function createNoticeAction(
  _prev: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const audience = String(formData.get('audience') ?? 'ALL');
  const classroomIds = formData.getAll('classroomIds').map(String).filter(Boolean);

  if (title.length < 2) return { error: 'Give the notice a title.' };
  if (body.length < 2) return { error: 'Write the notice.' };
  if (audience === 'CLASSROOMS' && classroomIds.length === 0) {
    return { error: 'Choose at least one class for a class-specific notice.' };
  }

  const expiresAt = String(formData.get('expiresAt') ?? '').trim();

  try {
    await apiFetch('/notices', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        title,
        body,
        type: String(formData.get('type') ?? 'GENERAL'),
        audience,
        classroomIds: audience === 'CLASSROOMS' ? classroomIds : undefined,
        pinned: formData.get('pinned') === 'on',
        expiresAt: expiresAt || null,
        publish: formData.get('publish') === 'on',
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not publish the notice.') };
  }

  revalidatePath('/school/notices');

  return {
    success:
      formData.get('publish') === 'on'
        ? 'Published. Everyone in the audience can see it now.'
        : 'Saved as a draft. Nobody can see it yet.',
  };
}
