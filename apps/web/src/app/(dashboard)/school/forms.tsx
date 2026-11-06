'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { GUARDIAN_RELATIONS } from '@poetree/shared';
import type { AcademicYearSummary, ExistingAccount, TeacherSummary } from '@poetree/shared';
import {
  Button,
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
} from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import {
  createAcademicYearAction,
  createClassroomAction,
  createParentAction,
  createTeacherAction,
  resolveExistingAccountAction,
  type ActionState,
} from './actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

function Result({ state }: { state: ActionState }) {
  return (
    <>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
    </>
  );
}

/**
 * What adding a teacher or parent said — and, when the school already has the
 * person, the way forward on the account they have.
 */
function CreateResult({ state, kind }: { state: ActionState; kind: 'teachers' | 'parents' }) {
  if (!state.existingAccount) return <Result state={state} />;
  return (
    <ExistingAccountOffer
      key={state.existingAccount.userId}
      kind={kind}
      message={state.error}
      account={state.existingAccount}
      details={state.roleDetails ?? {}}
    />
  );
}

/**
 * A second account for the same person is refused, so offer the right thing:
 * a removed account put back, or the other role added to the one they hold.
 *
 * It sits inside the add form and submits through its own `formAction`, so it
 * needs no form of its own. The fields it sends are hidden copies of what was
 * typed — React has cleared the form by now — under names of their own, and
 * `formNoValidate` because the cleared form's required boxes are not its.
 */
function ExistingAccountOffer({
  kind,
  message,
  account,
  details,
}: {
  kind: 'teachers' | 'parents';
  message?: string;
  account: ExistingAccount;
  details: Record<string, string>;
}) {
  const [offer, offerAction] = useActionState<ActionState, FormData>(
    resolveExistingAccountAction,
    {},
  );
  // The add form's own status: this button submits it, with another action.
  const { pending } = useFormStatus();

  if (offer.success) {
    return (
      <div className="space-y-2">
        <FormSuccess message={offer.success} />
        {offer.link && (
          <Link
            href={offer.link.href}
            className="inline-block text-sm font-medium text-navy-700 underline hover:text-navy-900"
          >
            {offer.link.label}
          </Link>
        )}
      </div>
    );
  }

  const role = kind === 'teachers' ? 'teacher' : 'parent';
  const mode = account.removed
    ? 'restore'
    : account.roles.includes(kind === 'teachers' ? 'PARENT' : 'TEACHER')
      ? 'add-role'
      : null;

  return (
    <div className="space-y-3">
      <FormError message={message} />

      {mode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-navy-50/60 px-3.5 py-3 ring-1 ring-inset ring-navy-100">
          <input type="hidden" name="offer.kind" value={kind} />
          <input type="hidden" name="offer.mode" value={mode} />
          <input type="hidden" name="offer.userId" value={account.userId} />
          {Object.entries(details).map(([name, value]) => (
            <input key={name} type="hidden" name={`offer.${name}`} value={value} />
          ))}

          <Button
            type="submit"
            variant="secondary"
            formAction={offerAction}
            formNoValidate
            disabled={pending}
          >
            {pending
              ? 'Working…'
              : mode === 'restore'
                ? `Restore ${account.name}`
                : `Add the ${role} role to ${account.name}`}
          </Button>
          <span className="min-w-[12rem] flex-1 text-xs text-slate-500">
            {mode === 'restore'
              ? 'They come back on the account they had, with the same sign-in.'
              : `Their sign-in and password stay as they are; the app lets them switch between ${
                  kind === 'teachers' ? 'parent and teacher' : 'teacher and parent'
                }.`}
          </span>
        </div>
      )}

      <FormError message={offer.error} />
    </div>
  );
}

export function TeacherForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createTeacherAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <CreateResult state={state} kind="teachers" />

      <FieldSet legend="Details">
        <Field label="Full name" required>
          <Input name="name" required />
        </Field>
        <Field label="Email" required>
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Phone">
          <Input name="phone" placeholder="+91 98200 00000" />
        </Field>
        <Field
          label="Password"
          required
          hint="At least 8 characters, with a letter and a number. They sign in to the app with it."
        >
          <Input
            name="password"
            type="text"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,72}"
            title="At least 8 characters, with a letter and a number"
            autoComplete="off"
          />
        </Field>
      </FieldSet>

      <FieldSet legend="Employment">
        <Field label="Employee code">
          <Input name="employeeCode" />
        </Field>
        <Field label="Qualification">
          <Input name="qualification" placeholder="B.Ed, Early Childhood Education" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add teacher</SubmitButton>
    </form>
  );
}

export function ParentForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createParentAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <CreateResult state={state} kind="parents" />

      <FieldSet legend="Details">
        <Field label="Full name" required>
          <Input name="name" required />
        </Field>
        <Field label="Phone" required hint="This is how the parent signs in.">
          <Input name="phone" required placeholder="+91 98200 00000" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="off" />
        </Field>
        <Field label="Password" required hint="At least 8 characters, with a letter and a number.">
          <Input
            name="password"
            type="text"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,72}"
            title="At least 8 characters, with a letter and a number"
            autoComplete="off"
          />
        </Field>
        <Field label="Relation">
          <Select name="relation" defaultValue="GUARDIAN">
            {GUARDIAN_RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {titleCase(relation)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Occupation">
          <Input name="occupation" />
        </Field>
        <Field label="Address">
          <Input name="address" autoComplete="off" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add parent</SubmitButton>
    </form>
  );
}

interface ClassLevelOption {
  id: string;
  name: string;
}

export function ClassroomForm({
  academicYears,
  teachers,
  classLevels,
}: {
  academicYears: AcademicYearSummary[];
  teachers: TeacherSummary[];
  classLevels: ClassLevelOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createClassroomAction, {});

  if (academicYears.length === 0) {
    return (
      <Notice tone="info" title="Create an academic year first">
        Classrooms belong to a year, and so will attendance and fees in later phases.
      </Notice>
    );
  }

  const current = academicYears.find((year) => year.isCurrent) ?? academicYears[0];

  return (
    <form action={formAction} className="space-y-6">
      <Result state={state} />

      <FieldSet>
        <Field label="Academic year" required>
          <Select name="academicYearId" required defaultValue={current?.id}>
            {academicYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" required>
          {/* The standards the Super Admin maintains, not a fixed four. */}
          <Select name="classLevelId" required defaultValue="">
            <option value="" disabled>
              Choose
            </option>
            {classLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section" required>
          <Input name="section" required placeholder="A" />
        </Field>
        <Field label="Capacity">
          <Input name="capacity" type="number" min={1} placeholder="25" />
        </Field>
        <Field label="Class teacher">
          <Select name="classTeacherId" defaultValue="">
            <option value="">Unassigned</option>
            {teachers.map((teacher) => (
              <option key={teacher.userId} value={teacher.userId}>
                {teacher.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Creating…">Create classroom</SubmitButton>
    </form>
  );
}

export function AcademicYearForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createAcademicYearAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <Result state={state} />

      <FieldSet>
        <Field label="Name" required hint="For example 2026-27.">
          <Input name="name" required placeholder="2026-27" />
        </Field>
        <Field label="Starts" required>
          <Input name="startDate" type="date" required />
        </Field>
        <Field label="Ends" required>
          <Input name="endDate" type="date" required />
        </Field>
      </FieldSet>

      <label className="flex items-center gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isCurrent"
          defaultChecked
          className="h-4 w-4 rounded border-navy-300 text-navy-900 focus:ring-navy-600"
        />
        Make this the current year
      </label>

      <SubmitButton variant="secondary" pendingLabel="Creating…">
        Create academic year
      </SubmitButton>
    </form>
  );
}
