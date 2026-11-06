'use client';

import { useActionState } from 'react';
import { GENDERS, type ClassroomSummary } from '@poetree/shared';
import { Field, FieldSet, FormError, Input, Select } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { FamilyFields } from '../family-fields';
import { createStudentWithFamilyAction, type FamilyState } from '../family-actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * A child and their parent, in one form.
 *
 * It used to be two: add the parent on the Parents page, then come back and
 * add the child under them. Now the family is typed in once — a new parent is
 * opened with the child, or one already here is found by name or number — and
 * the office lands on the child's page, where a second parent can be linked.
 */
export function AddStudentForm({ classrooms }: { classrooms: ClassroomSummary[] }) {
  const [state, formAction, pending] = useActionState<FamilyState, FormData>(
    createStudentWithFamilyAction,
    {},
  );

  return (
    <KeptForm action={formAction} className="space-y-8">
      {/* Three parts, as a school form in India asks for them: given name,
          father's name, surname. */}
      <FieldSet legend="The child">
        <Field label="First name" required>
          <Input name="firstName" required maxLength={60} />
        </Field>
        <Field label="Middle name" hint="The father’s given name.">
          <Input name="middleName" maxLength={60} />
        </Field>
        <Field label="Surname">
          <Input name="lastName" maxLength={60} />
        </Field>
        <Field label="Date of birth" required>
          <Input
            name="dateOfBirth"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Gender" required>
          <Select name="gender" required defaultValue="">
            <option value="" disabled>
              Choose
            </option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {titleCase(gender)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Blood group">
          <Input name="bloodGroup" maxLength={8} />
        </Field>
      </FieldSet>

      <FieldSet legend="Class">
        <Field label="Admission number" required>
          <Input name="admissionNo" required maxLength={40} />
        </Field>
        <Field label="Class">
          <Select name="classroomId" defaultValue="">
            <option value="">Not in a class yet</option>
            {classrooms
              .filter((classroom) => classroom.academicYear.isCurrent)
              .map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.classLevel.name} — {classroom.section}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Roll number">
          <Input name="rollNo" maxLength={20} />
        </Field>
      </FieldSet>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Parent or guardian
        </legend>
        <p className="mb-4 text-sm text-slate-500">
          A child is reached through a parent’s account and never signs in themselves. They become
          the main contact; add a second parent on the child’s page.
        </p>
        <FamilyFields state={state} pending={pending} />
      </fieldset>

      {/* With an account to use instead, the reason sits beside that offer. */}
      <FormError message={state.existingAccount ? undefined : state.error} />

      <PendingButton pending={pending} pendingLabel="Adding…">
        Add the child
      </PendingButton>
    </KeptForm>
  );
}
