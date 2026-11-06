'use server';

import { revalidatePath } from 'next/cache';
import type { ExistingAccount } from '@poetree/shared';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';
import { chosenFile, uploadFile } from '@/lib/upload';

export interface ActionState {
  error?: string;
  success?: string;
  /**
   * Who already holds the email or phone, when adding someone was refused
   * because the school has them. The form offers the role, or a restore,
   * on that account instead of a second one.
   */
  existingAccount?: ExistingAccount;
  /**
   * The role's own details as they were typed, sent with that offer. The form
   * has been reset by the time it is clicked, so they travel back here.
   */
  roleDetails?: Record<string, string>;
  /** Where to see the person, after the offer worked. */
  link?: { href: string; label: string };
}

/** The account a 409 names, if it names one. */
function existingAccountIn(error: unknown): ExistingAccount | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return undefined;
  const details = error.details;
  if (!details || typeof details !== 'object') return undefined;
  const account = (details as { existingAccount?: unknown }).existingAccount;
  if (!account || typeof account !== 'object') return undefined;
  if (typeof (account as { userId?: unknown }).userId !== 'string') return undefined;
  return account as ExistingAccount;
}

/** Only the fields that were filled in. */
function filled(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export interface ResetState {
  error?: string;
  done?: true;
}

/**
 * Sets a teacher's or parent's password to the one the office typed.
 *
 * Nothing about the password is returned, logged or cached — the office
 * already knows it, because they chose it, and there is no reason for it to
 * exist anywhere else. The reply is only that it worked.
 */
export async function changePasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const kind = String(formData.get('kind') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');

  if (kind !== 'parents' && kind !== 'teachers') return { error: 'Unknown user.' };
  if (!userId) return { error: 'Unknown user.' };

  try {
    await apiFetch(`/${kind}/${userId}/change-password`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { newPassword },
    });
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error, 'Could not change the password.') };
  }
}

function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

function num(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createTeacherAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const roleDetails = filled({
    employeeCode: text(formData, 'employeeCode'),
    qualification: text(formData, 'qualification'),
  });

  try {
    await apiFetch('/teachers', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        password: text(formData, 'password'),
        ...roleDetails,
      },
    });
  } catch (error) {
    return {
      error: errorMessage(error, 'Could not add the teacher.'),
      existingAccount: existingAccountIn(error),
      roleDetails,
    };
  }

  revalidatePath('/school/teachers');
  return { success: 'Teacher added.' };
}

export async function createParentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const roleDetails = filled({
    relation: text(formData, 'relation') ?? 'GUARDIAN',
    occupation: text(formData, 'occupation'),
    address: text(formData, 'address'),
  });

  try {
    await apiFetch('/parents', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        phone: text(formData, 'phone'),
        email: text(formData, 'email'),
        password: text(formData, 'password'),
        ...roleDetails,
      },
    });
  } catch (error) {
    return {
      error: errorMessage(error, 'Could not add the parent.'),
      existingAccount: existingAccountIn(error),
      roleDetails,
    };
  }

  revalidatePath('/school/parents');
  revalidatePath('/school/students');
  return { success: 'Parent added. They can now be linked to a child.' };
}

/**
 * The way forward the 409 offered: the role added to the account the person
 * already has, or a removed account put back. One action for both forms —
 * `kind` says which list the form was adding to.
 *
 * Its fields are `offer.`-prefixed: it is submitted from inside the add form,
 * whose own boxes share the plain names.
 */
export async function resolveExistingAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const offer = (key: string) => text(formData, `offer.${key}`);
  const kind = offer('kind');
  const mode = offer('mode');
  const userId = offer('userId');

  // The id goes into an API path, so it is held to the shape of one.
  if ((kind !== 'teachers' && kind !== 'parents') || !userId || !ID.test(userId)) {
    return { error: 'Unknown account.' };
  }
  if (mode !== 'restore' && mode !== 'add-role') return { error: 'Unknown account.' };

  const body =
    kind === 'teachers'
      ? filled({ employeeCode: offer('employeeCode'), qualification: offer('qualification') })
      : filled({
          relation: offer('relation'),
          occupation: offer('occupation'),
          address: offer('address'),
        });

  // A TeacherSummary or a ParentSummary; both carry these.
  type Person = { name: string; email: string | null; phone: string | null };

  let person: Person;
  try {
    person =
      mode === 'restore'
        ? await apiFetch<Person>(`/${kind}/${userId}/restore`, {
            method: 'POST',
            redirectOnAuthFailure: false,
          })
        : await apiFetch<Person>(`/${kind}/${userId}/from-account`, {
            method: 'POST',
            redirectOnAuthFailure: false,
            body,
          });
  } catch (error) {
    return {
      error: errorMessage(
        error,
        mode === 'restore' ? 'Could not restore them.' : 'Could not add the role.',
      ),
    };
  }

  revalidatePath('/school/teachers');
  revalidatePath('/school/parents');
  revalidatePath('/school/students');

  const role = kind === 'teachers' ? 'teacher' : 'parent';
  const list = kind === 'teachers' ? 'Teachers' : 'Parents';
  return {
    success:
      mode === 'restore'
        ? `${person.name} is restored as a ${role}.`
        : `${person.name} is now a ${role} here too, on the account they already have.`,
    link: {
      href: `/school/${kind}?search=${encodeURIComponent(person.email ?? person.phone ?? person.name)}`,
      label: `See ${person.name} on ${list}`,
    },
  };
}

export async function createClassroomAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/classrooms', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        academicYearId: text(formData, 'academicYearId'),
        classLevelId: text(formData, 'classLevelId'),
        section: text(formData, 'section'),
        capacity: num(formData, 'capacity'),
        classTeacherId: text(formData, 'classTeacherId') ?? null,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the classroom.') };
  }

  revalidatePath('/school/classrooms');
  return { success: 'Classroom created.' };
}

export async function createAcademicYearAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/academic-years', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        startDate: text(formData, 'startDate'),
        endDate: text(formData, 'endDate'),
        isCurrent: formData.get('isCurrent') === 'on',
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the academic year.') };
  }

  revalidatePath('/school/classrooms');
  return { success: 'Academic year created.' };
}

/**
 * A teacher's signature, printed on the report cards of the classes they
 * teach. Uploaded by the office, which is where the paper copy is signed.
 */
export async function uploadTeacherSignatureAction(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = chosenFile(formData, 'signature');

  try {
    const fileId = file ? await uploadFile(file) : null;
    await apiFetch(`/teachers/${userId}/signature`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { fileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the signature.') };
  }

  revalidatePath('/school/teachers');
  return { success: file ? 'Signature saved.' : 'Signature removed.' };
}
