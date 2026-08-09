'use client';

import { useActionState } from 'react';
import { CLASS_LEVEL_CODES, CLASS_LEVEL_LABELS, GENDERS, GUARDIAN_RELATIONS } from '@poetree/shared';
import type {
  AcademicYearSummary,
  ClassroomSummary,
  ParentSummary,
  TeacherSummary,
} from '@poetree/shared';
import {
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
  createStudentAction,
  createTeacherAction,
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

export function TeacherForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createTeacherAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <Result state={state} />

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
        <Field label="Password" required hint="Used when the teacher app ships in Phase 2.">
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
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
      <Result state={state} />

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
        <Field label="Password" required>
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
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
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add parent</SubmitButton>
    </form>
  );
}

export function StudentForm({
  parents,
  classrooms,
}: {
  parents: ParentSummary[];
  classrooms: ClassroomSummary[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createStudentAction, {});

  if (parents.length === 0) {
    return (
      <Notice tone="info" title="Add a parent first">
        A child is always reached through a guardian&rsquo;s account and never has a login of their
        own.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <Result state={state} />

      <FieldSet legend="Child">
        <Field label="First name" required>
          <Input name="firstName" required />
        </Field>
        <Field label="Last name">
          <Input name="lastName" />
        </Field>
        <Field label="Date of birth" required>
          <Input name="dateOfBirth" type="date" required />
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
      </FieldSet>

      <FieldSet legend="Enrolment">
        <Field label="Admission number" required>
          <Input name="admissionNo" required placeholder="SUN-001" />
        </Field>
        <Field label="Roll number">
          <Input name="rollNo" />
        </Field>
        <Field label="Classroom">
          <Select name="classroomId" defaultValue="">
            <option value="">Unassigned</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.classLevel.name} — {classroom.section}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Guardian" required>
          <Select name="parentProfileId" required defaultValue="">
            <option value="" disabled>
              Choose a parent
            </option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} ({parent.phone})
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add student</SubmitButton>
    </form>
  );
}

export function ClassroomForm({
  academicYears,
  teachers,
}: {
  academicYears: AcademicYearSummary[];
  teachers: TeacherSummary[];
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
          <Select name="classLevelCode" required defaultValue="">
            <option value="" disabled>
              Choose
            </option>
            {CLASS_LEVEL_CODES.map((code) => (
              <option key={code} value={code}>
                {CLASS_LEVEL_LABELS[code]}
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
