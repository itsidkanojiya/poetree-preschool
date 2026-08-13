'use client';

import { useActionState } from 'react';
import type { StandardSummary } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  SubmitButton,
} from '@/components/ui/form';
import {
  createStandardAction,
  renameStandardAction,
  setStandardActiveAction,
  type StandardState,
} from './actions';

export function NewStandardForm() {
  const [state, formAction] = useActionState<StandardState, FormData>(createStandardAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Name" required hint="What a parent and a teacher will read.">
          <Input name="name" required placeholder="Toddler" />
        </Field>
        <Field label="Code" required hint="Fixed once saved. Fee structures refer to it.">
          <Input
            name="code"
            required
            placeholder="TODDLER"
            pattern="[A-Za-z][A-Za-z0-9_]{1,39}"
            className="font-mono uppercase"
          />
        </Field>
      </FieldSet>

      <FieldSet>
        <Field label="Youngest age (months)" hint="Guidance for the office. Never enforced.">
          <Input name="minAgeMonths" type="number" min={0} max={240} placeholder="18" />
        </Field>
        <Field label="Oldest age (months)">
          <Input name="maxAgeMonths" type="number" min={0} max={240} placeholder="30" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add standard</SubmitButton>
    </form>
  );
}

/** Renaming and reordering in place — the two things actually done often. */
export function StandardRow({ standard }: { standard: StandardSummary }) {
  const [state, formAction] = useActionState<StandardState, FormData>(
    renameStandardAction.bind(null, standard.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Input
        name="name"
        defaultValue={standard.name}
        className="h-9 w-44 text-sm"
        aria-label={`Name of ${standard.name}`}
      />
      <Input
        name="sortOrder"
        type="number"
        defaultValue={standard.sortOrder}
        className="h-9 w-16 text-sm"
        aria-label={`Order of ${standard.name}`}
      />
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Save
      </button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

export function RetireStandardButton({ standard }: { standard: StandardSummary }) {
  const action = setStandardActiveAction.bind(null, standard.id, !standard.isActive);

  return (
    <form action={action}>
      <button
        type="submit"
        // Refused server-side while classrooms are in it, so the count is shown
        // rather than the button hidden — a disabled control with no reason is
        // worse than an answer.
        title={
          standard.isActive && standard.classroomCount > 0
            ? `${standard.classroomCount} classrooms are still in this standard`
            : undefined
        }
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        {standard.isActive ? 'Retire' : 'Bring back'}
      </button>
    </form>
  );
}
