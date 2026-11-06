'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  GENDERS,
  GUARDIAN_RELATIONS,
  type ExistingAccount,
  type Paginated,
  type ParentSummary,
  type StudentSummary,
} from '@poetree/shared';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';

/**
 * A child's family, from the child: adding a child with their parent, linking
 * and unlinking parents, editing a parent, and choosing the main contact.
 *
 * Every id here arrives from the browser and goes into an API path, so each is
 * held to the shape of an id first. The API decides everything else — that the
 * child and the parent are this school's, that the last parent stays.
 */

export interface FamilyState {
  error?: string;
  success?: string;
  /**
   * Someone the school already has with the phone or email typed in. The form
   * offers to use their account instead of opening a second one.
   */
  existingAccount?: ExistingAccount;
}

export interface ParentOption {
  /** The parent profile, which is what a child is linked to. */
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  children: string[];
}

type Relation = (typeof GUARDIAN_RELATIONS)[number];

function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

function relationOf(formData: FormData): Relation {
  const value = text(formData, 'relation');
  return (GUARDIAN_RELATIONS as readonly string[]).includes(value ?? '')
    ? (value as Relation)
    : 'GUARDIAN';
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

function refreshFamily(studentId?: string): void {
  if (studentId) revalidatePath(`/school/students/${studentId}`);
  revalidatePath('/school/students');
  revalidatePath('/school/parents');
  revalidatePath('/school');
}

/** Parents matching what the office typed, for linking one to a child. */
export async function findParentsAction(search: string): Promise<ParentOption[]> {
  const query = String(search ?? '')
    .trim()
    .slice(0, 60);
  if (query.length < 2) return [];
  try {
    const page = await apiFetch<Paginated<ParentSummary>>('/parents', {
      query: { search: query, pageSize: 8 },
      redirectOnAuthFailure: false,
    });
    return page.items.map((parent) => ({
      id: parent.id,
      name: parent.name,
      phone: parent.phone,
      email: parent.email,
      children: parent.children.filter((child) => !child.removed).map((child) => child.name),
    }));
  } catch {
    return [];
  }
}

/**
 * The parent profile for an account the school already has: a parent as they
 * are, a teacher given the parent role on the account they hold, or a removed
 * parent put back.
 */
async function profileFor(account: ExistingAccount, relation: Relation): Promise<string> {
  if (account.removed) {
    const parent = await apiFetch<ParentSummary>(`/parents/${account.userId}/restore`, {
      method: 'POST',
      redirectOnAuthFailure: false,
    });
    return parent.id;
  }
  if (account.roles.includes('PARENT')) {
    return (
      await apiFetch<ParentSummary>(`/parents/${account.userId}`, { redirectOnAuthFailure: false })
    ).id;
  }
  const parent = await apiFetch<ParentSummary>(`/parents/${account.userId}/from-account`, {
    method: 'POST',
    redirectOnAuthFailure: false,
    body: { relation },
  });
  return parent.id;
}

/**
 * Who the family form names: a parent already here, a new one, or — after a
 * refusal — the account the school already has for the number typed.
 */
async function guardianFrom(
  formData: FormData,
  previous: FamilyState,
): Promise<
  | { parentProfileId: string; relation: Relation }
  | { parent: Record<string, string>; relation: Relation }
  | { error: string }
> {
  const relation = relationOf(formData);

  const useAccount = text(formData, 'useAccount');
  if (useAccount) {
    const account = previous.existingAccount;
    if (!ID.test(useAccount) || !account || account.userId !== useAccount) {
      return { error: 'Choose the parent again.' };
    }
    return { parentProfileId: await profileFor(account, relation), relation };
  }

  if (text(formData, 'familyMode') === 'existing') {
    const parentProfileId = text(formData, 'parentProfileId');
    if (!parentProfileId || !ID.test(parentProfileId)) {
      return { error: 'Find the parent and choose them from the list.' };
    }
    return { parentProfileId, relation };
  }

  const name = text(formData, 'parent.name');
  const phone = text(formData, 'parent.phone');
  const password = text(formData, 'parent.password');
  if (!name || !phone || !password) {
    return { error: 'A new parent needs a name, a mobile number and a password.' };
  }
  const parent: Record<string, string> = { name, phone, password, relation };
  for (const key of ['email', 'occupation', 'address'] as const) {
    const value = text(formData, `parent.${key}`);
    if (value) parent[key] = value;
  }
  return { parent, relation };
}

/** A refusal, with the account it names when there is one. */
function refused(error: unknown, fallback: string): FamilyState {
  return { error: errorMessage(error, fallback), existingAccount: existingAccountIn(error) };
}

/**
 * Adding a child and their family in one form. A new parent is opened with the
 * child — both or neither — so nothing is typed twice. Lands on the child's
 * page, where the rest of the family can be added.
 */
export async function createStudentWithFamilyAction(
  previous: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  const firstName = text(formData, 'firstName');
  const dateOfBirth = text(formData, 'dateOfBirth');
  const gender = text(formData, 'gender');
  const admissionNo = text(formData, 'admissionNo');
  if (!firstName) return { error: 'The child’s name is needed.' };
  if (!dateOfBirth) return { error: 'The date of birth is needed.' };
  if (!gender || !(GENDERS as readonly string[]).includes(gender)) {
    return { error: 'Choose boy, girl or other.' };
  }
  if (!admissionNo) return { error: 'The admission number is needed.' };

  let student: StudentSummary;
  try {
    const guardian = await guardianFrom(formData, previous);
    if ('error' in guardian) return { error: guardian.error };

    student = await apiFetch<StudentSummary>('/students', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        firstName,
        middleName: text(formData, 'middleName'),
        lastName: text(formData, 'lastName'),
        dateOfBirth,
        gender,
        admissionNo,
        rollNo: text(formData, 'rollNo'),
        classroomId: text(formData, 'classroomId'),
        bloodGroup: text(formData, 'bloodGroup'),
        ...('parent' in guardian
          ? { newParent: guardian.parent }
          : {
              guardians: [
                {
                  parentProfileId: guardian.parentProfileId,
                  relation: guardian.relation,
                  isPrimary: true,
                },
              ],
            }),
      },
    });
  } catch (error) {
    return refused(error, 'Could not add the child.');
  }

  refreshFamily();
  redirect(`/school/students/${student.id}?done=added&who=${encodeURIComponent(student.fullName)}`);
}

/** Linking another parent to a child, from the child's page. */
export async function addGuardianAction(
  studentId: string,
  previous: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  if (!ID.test(studentId)) return { error: 'Not a child on the roll.' };

  let student: StudentSummary;
  try {
    const guardian = await guardianFrom(formData, previous);
    if ('error' in guardian) return { error: guardian.error };

    student = await apiFetch<StudentSummary>(`/students/${studentId}/guardians`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { ...guardian, isPrimary: formData.get('isPrimary') === 'on' },
    });
  } catch (error) {
    return refused(error, 'Could not link the parent.');
  }

  refreshFamily(studentId);
  const linked = student.guardians.length;
  return { success: `Linked. ${student.fullName} has ${linked} parents or guardians now.` };
}

/**
 * Correcting a parent's details from their child's page — their own details,
 * which every one of their children shares — and how they stand to this child.
 */
export async function updateFamilyMemberAction(
  studentId: string,
  userId: string,
  parentProfileId: string,
  currentRelation: string,
  _previous: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  if (![studentId, userId, parentProfileId].every((id) => ID.test(id))) {
    return { error: 'Not a parent of this child.' };
  }

  const name = text(formData, 'name');
  const phone = text(formData, 'phone');
  if (!name || !phone) return { error: 'A parent needs a name and a mobile number.' };
  const email = text(formData, 'email');
  const relation = relationOf(formData);

  try {
    await apiFetch(`/parents/${userId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name,
        phone,
        // An email is a way to sign in; it can be changed here, not taken away.
        ...(email ? { email } : {}),
        occupation: text(formData, 'occupation') ?? '',
        address: text(formData, 'address') ?? '',
      },
    });
    if (relation !== currentRelation) {
      await apiFetch(`/students/${studentId}/guardians/${parentProfileId}`, {
        method: 'PATCH',
        redirectOnAuthFailure: false,
        body: { relation },
      });
    }
  } catch (error) {
    return refused(error, 'Could not save the parent’s details.');
  }

  refreshFamily(studentId);
  return { success: `${name}’s details are saved.` };
}

function backToChild(studentId: string, params: Record<string, string>): never {
  redirect(`/school/students/${studentId}?${new URLSearchParams(params).toString()}`);
}

/** The parent the school contacts first about this child. */
export async function makePrimaryAction(
  studentId: string,
  parentProfileId: string,
  name: string,
): Promise<void> {
  if (!ID.test(studentId) || !ID.test(parentProfileId)) throw new Error('Not a valid id');
  let outcome: Record<string, string>;
  try {
    await apiFetch(`/students/${studentId}/guardians/${parentProfileId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { isPrimary: true },
    });
    outcome = { done: 'primary', who: name };
  } catch (error) {
    outcome = { problem: errorMessage(error, 'Could not change the main contact.').slice(0, 300) };
  }
  refreshFamily(studentId);
  backToChild(studentId, outcome);
}

/** Unlinking a parent from this child only. Refused for the last one. */
export async function unlinkGuardianAction(
  studentId: string,
  parentProfileId: string,
  name: string,
): Promise<void> {
  if (!ID.test(studentId) || !ID.test(parentProfileId)) throw new Error('Not a valid id');
  let outcome: Record<string, string>;
  try {
    await apiFetch(`/students/${studentId}/guardians/${parentProfileId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
    });
    outcome = { done: 'unlinked', who: name };
  } catch (error) {
    outcome = { problem: errorMessage(error, 'Could not unlink the parent.').slice(0, 300) };
  }
  refreshFamily(studentId);
  backToChild(studentId, outcome);
}
