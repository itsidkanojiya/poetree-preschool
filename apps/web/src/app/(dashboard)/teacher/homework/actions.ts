'use server';

import { revalidatePath } from 'next/cache';
import type { SubmissionStatus } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface HomeworkState {
  error?: string;
  success?: string;
}

export async function createHomeworkAction(
  _prev: HomeworkState,
  formData: FormData,
): Promise<HomeworkState> {
  const classroomId = String(formData.get('classroomId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const publish = formData.get('publish') === 'on';

  if (!classroomId) return { error: 'Choose a class.' };
  if (title.length < 2) return { error: 'Give the homework a title.' };

  try {
    await apiFetch('/homework', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        classroomId,
        title,
        description: String(formData.get('description') ?? '').trim() || undefined,
        dueDate: String(formData.get('dueDate') ?? ''),
        allowsSubmission: formData.get('allowsSubmission') === 'on',
        publish,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the homework.') };
  }

  revalidatePath('/teacher/homework');

  // Publishing is what creates a row per child, so the wording distinguishes the
  // two states rather than saying "saved" for both.
  return {
    success: publish
      ? 'Published. Every child in the class now has it.'
      : 'Saved as a draft. The class cannot see it yet.',
  };
}

export async function publishHomeworkAction(homeworkId: string): Promise<void> {
  await apiFetch(`/homework/${homeworkId}/publish`, { method: 'POST' });
  revalidatePath('/teacher/homework');
}

export async function reviewSubmissionAction(
  submissionId: string,
  status: SubmissionStatus,
): Promise<void> {
  await apiFetch(`/homework/submissions/${submissionId}`, {
    method: 'PATCH',
    body: { status },
  });
  revalidatePath('/teacher/homework');
}
