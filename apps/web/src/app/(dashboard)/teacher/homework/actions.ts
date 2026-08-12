'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import type { SubmissionStatus } from '@poetree/shared';
import { API_BASE_URL, apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

export interface HomeworkState {
  error?: string;
  success?: string;
}

/**
 * Uploads one worksheet and returns its id.
 *
 * Same two-step shape as a student document: POST /files owns the sniffing,
 * the size caps and where the bytes land, and doing it here rather than in the
 * browser keeps the access token in its httpOnly cookie.
 */
async function uploadWorksheet(file: File): Promise<string> {
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
    throw new Error(message);
  }

  return (data as { id: string }).id;
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

  // The worksheet, if the teacher attached one. Uploaded before the homework
  // exists, so a rejected file costs nothing — better than creating the work
  // and then failing to hang the page a parent is meant to print off it.
  const fileIds: string[] = [];
  try {
    for (const entry of formData.getAll('worksheets')) {
      if (entry instanceof File && entry.size > 0) fileIds.push(await uploadWorksheet(entry));
    }
  } catch (error) {
    return { error: errorMessage(error, 'Could not upload the worksheet.') };
  }

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
        // Homework that is an activity closes itself when the child plays it.
        learningActivityId: String(formData.get('learningActivityId') ?? '').trim() || null,
        publish,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
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
