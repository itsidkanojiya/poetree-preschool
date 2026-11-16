'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PersonRemovedResponse, StudentSummary } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';

/**
 * Taking people off the school, and putting them back.
 *
 * Each one comes back to the list with the outcome in the address — `done` and
 * `who`, or `problem` — the way the Drive callback reports to the gallery. The
 * row it was clicked on is gone by then, so there is nothing left on it to say
 * "removed"; the page reads the outcome and says it in a toast.
 */
function backTo(path: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(query ? `${path}?${query}` : path);
}

/** Every screen that shows who is a teacher or a parent here, and of whom. */
function refreshRoster(): void {
  revalidatePath('/school/teachers');
  revalidatePath('/school/parents');
  revalidatePath('/school/students');
  revalidatePath('/school');
}

const failure = (error: unknown, fallback: string) => ({
  problem: errorMessage(error, fallback).slice(0, 300),
});

/**
 * The id arrives from the browser and goes into an API path, so it is held to
 * the shape of an id first — never a path of its own.
 */
function assertId(id: string): void {
  if (!ID.test(id)) throw new Error('Not a valid id');
}

/** What removing someone did, as the toast says it. */
function removedOutcome(person: PersonRemovedResponse): Record<string, string> {
  if (person.childrenRemoved.length > 0) {
    return {
      done: 'removed-with',
      who: `${person.name}|${person.childrenRemoved.map((child) => child.name).join(', ')}`,
    };
  }
  return { done: person.keptAsOtherRole ? 'removed-role' : 'deleted', who: person.name };
}

/**
 * Removing a teacher — deleted for good, unless they are also a parent here,
 * when only the teacher role goes. `fromRemoved`: done from the Removed list,
 * deleting someone removed before removal was for good.
 */
export async function removeTeacherAction(userId: string, fromRemoved = false): Promise<void> {
  assertId(userId);
  let outcome: Record<string, string>;
  try {
    outcome = removedOutcome(
      await apiFetch<PersonRemovedResponse>(`/teachers/${userId}`, {
        method: 'DELETE',
        redirectOnAuthFailure: false,
      }),
    );
  } catch (error) {
    outcome = failure(error, 'Could not remove the teacher.');
  }

  refreshRoster();
  revalidatePath('/school/classrooms');
  revalidatePath('/school/timetable');
  backTo('/school/teachers', fromRemoved ? { removed: 'true', ...outcome } : outcome);
}

/**
 * Removing a parent — deleted for good, unless they also teach here. A child
 * for whom they were the only parent is removed with them (the API does that),
 * so the toast names the children who went too.
 *
 * `studentId` is the child's page it was done from: back there if the child
 * is still on the roll, or to the list if they went with the parent.
 * `fromRemoved`: done from the Removed list.
 */
export async function removeParentAction(
  userId: string,
  studentId?: string,
  fromRemoved = false,
): Promise<void> {
  assertId(userId);
  if (studentId) assertId(studentId);
  let outcome: Record<string, string>;
  let childStays = Boolean(studentId);
  try {
    const person = await apiFetch<PersonRemovedResponse>(`/parents/${userId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
    });
    outcome = removedOutcome(person);
    childStays = childStays && !person.childrenRemoved.some((child) => child.id === studentId);
  } catch (error) {
    outcome = failure(error, 'Could not remove the parent.');
  }

  refreshRoster();
  if (studentId) revalidatePath(`/school/students/${studentId}`);
  if (studentId && childStays) backTo(`/school/students/${studentId}`, outcome);
  if (fromRemoved) backTo('/school/students', { removed: 'true', ...outcome });
  backTo(studentId ? '/school/students' : '/school/parents', outcome);
}

/**
 * Switching a teacher's or parent's account off, or back on.
 *
 * Off signs them out at once and stops them signing in; on gives back
 * whatever roles they hold. The API checks the account is one of this
 * school's and that the caller may change it — this only says which.
 */
export async function setAccountStatusAction(
  kind: 'teachers' | 'parents',
  userId: string,
  status: 'ACTIVE' | 'INACTIVE',
  studentId?: string,
): Promise<void> {
  assertId(userId);
  if (studentId) assertId(studentId);
  if (kind !== 'teachers' && kind !== 'parents') throw new Error('Unknown kind of account');
  if (status !== 'ACTIVE' && status !== 'INACTIVE') throw new Error('Unknown status');

  let outcome: Record<string, string>;
  try {
    const person = await apiFetch<{ name: string }>(`/${kind}/${userId}`, {
      method: 'PATCH',
      body: { status },
      redirectOnAuthFailure: false,
    });
    outcome = { done: status === 'ACTIVE' ? 'activated' : 'deactivated', who: person.name };
  } catch (error) {
    outcome = failure(
      error,
      status === 'ACTIVE' ? 'Could not activate the account.' : 'Could not deactivate the account.',
    );
  }

  refreshRoster();
  if (studentId) {
    revalidatePath(`/school/students/${studentId}`);
    backTo(`/school/students/${studentId}`, outcome);
  }
  backTo(`/school/${kind}`, outcome);
}

/**
 * Removed from the child's own page, which is where a child's actions are. A
 * removed child has no page to come back to, so success lands on the list and
 * a refusal stays where it was asked.
 */
export async function removeStudentAction(studentId: string): Promise<void> {
  assertId(studentId);
  let student: StudentSummary;
  try {
    student = await apiFetch<StudentSummary>(`/students/${studentId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
    });
  } catch (error) {
    backTo(`/school/students/${studentId}`, failure(error, 'Could not remove the child.'));
  }

  refreshRoster();
  revalidatePath(`/school/students/${studentId}`);
  backTo('/school/students', { done: 'removed', who: student.fullName });
}

/** `from` is where the button was: the Removed list, or the child's own page. */
export async function restoreStudentAction(
  studentId: string,
  from: 'list' | 'child',
): Promise<void> {
  assertId(studentId);
  let outcome: Record<string, string>;
  try {
    const student = await apiFetch<StudentSummary>(`/students/${studentId}/restore`, {
      method: 'POST',
      redirectOnAuthFailure: false,
    });
    outcome = { done: 'restored', who: student.fullName };
  } catch (error) {
    outcome = failure(error, 'Could not restore the child.');
  }

  refreshRoster();
  revalidatePath(`/school/students/${studentId}`);
  if (from === 'child') backTo(`/school/students/${studentId}`, outcome);
  backTo('/school/students', { removed: 'true', ...outcome });
}
