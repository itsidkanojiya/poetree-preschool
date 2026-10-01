'use server';

import { revalidatePath } from 'next/cache';
import type { ReportGridChild } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

/**
 * Report card actions, shared by the teacher's grid and the office's.
 *
 * Each returns what it did or why it could not, rather than throwing: the grid
 * saves one child at a time as grades are picked, and a refusal belongs beside
 * that child, not on an error page.
 */

export interface SaveResult {
  child?: ReportGridChild;
  error?: string;
}

export async function saveReportCardAction(input: {
  termId: string;
  studentId: string;
  grades: Array<{ areaId: string; gradeLevelId: string | null }>;
  remarks?: string | null;
}): Promise<SaveResult> {
  try {
    const child = await apiFetch<ReportGridChild>('/results/report-cards', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: input,
    });
    return { child };
  } catch (error) {
    return { error: errorMessage(error, 'Could not save.') };
  }
}

export interface StepState {
  error?: string;
  success?: string;
}

function refresh() {
  revalidatePath('/teacher/results');
  revalidatePath('/school/results', 'layout');
}

async function step(
  path: string,
  body: unknown,
  success: string,
  failure: string,
): Promise<StepState> {
  try {
    await apiFetch(path, { method: 'POST', redirectOnAuthFailure: false, body });
  } catch (error) {
    return { error: errorMessage(error, failure) };
  }
  refresh();
  return { success };
}

/** The teacher hands the class to the office. */
export async function submitClassAction(classroomId: string, termId: string): Promise<StepState> {
  return step(
    `/results/classrooms/${classroomId}/terms/${termId}/submit`,
    {},
    'Sent to the office. They will check the cards and send them to families.',
    'Could not hand the class over.',
  );
}

export async function returnClassAction(classroomId: string, termId: string): Promise<StepState> {
  return step(
    `/results/classrooms/${classroomId}/terms/${termId}/return`,
    {},
    'Handed back to the class teacher.',
    'Could not hand the class back.',
  );
}

export async function publishAction(
  classroomId: string,
  termId: string,
  studentIds?: string[],
): Promise<StepState> {
  return step(
    `/results/classrooms/${classroomId}/terms/${termId}/publish`,
    studentIds ? { studentIds } : {},
    studentIds?.length === 1
      ? 'Published. The family has been told.'
      : 'Published. Every family in the class has been told.',
    'Could not publish.',
  );
}

export async function unpublishAction(reportCardId: string): Promise<StepState> {
  return step(
    `/results/report-cards/${reportCardId}/unpublish`,
    {},
    'Taken back. The family will not see it until it is published again.',
    'Could not take it back.',
  );
}
