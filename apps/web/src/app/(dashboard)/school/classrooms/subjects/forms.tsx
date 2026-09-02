'use client';

import { useActionState } from 'react';
import type { SubjectSummary } from '@poetree/shared';
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import {
  createSubjectAction,
  renameSubjectAction,
  retireSubjectAction,
  type SubjectState,
} from './actions';

export function NewSubjectForm() {
  const [state, formAction] = useActionState<SubjectState, FormData>(createSubjectAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <span className="min-w-[14rem] flex-1">
        <Field label="Subject" required hint="What it is called on the timetable.">
          <Input name="name" required placeholder="Circle time" />
        </Field>
      </span>
      <SubmitButton pendingLabel="Adding…">Add subject</SubmitButton>

      <span className="w-full">
        <FormError message={state.error} />
      </span>
      <Toast message={state.success} />
    </form>
  );
}

export function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const [state, formAction] = useActionState<SubjectState, FormData>(
    renameSubjectAction.bind(null, subject.id),
    {},
  );

  // A publication default belongs to the publisher. Offering an Edit that
  // always fails is worse than not offering one.
  if (!subject.isOwn) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-navy-950">{subject.name}</span>
        <span className="text-xs text-slate-400">Shared with every school</span>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <span className="w-56">
        <Input
          name="name"
          defaultValue={subject.name}
          className="py-1.5 text-sm"
          aria-label={`Name of ${subject.name}`}
        />
      </span>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Save
      </button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
      <Toast message={state.success} />
    </form>
  );
}

export function RetireSubjectButton({ subject }: { subject: SubjectSummary }) {
  return (
    <ConfirmButton
      action={retireSubjectAction.bind(null, subject.id)}
      label="Remove"
      title={`Remove “${subject.name}”?`}
      body={
        subject.timetableCount > 0
          ? `It is on ${subject.timetableCount} ${
              subject.timetableCount === 1 ? 'period' : 'periods'
            } of your timetables. Those periods keep it — it simply stops being offered for new ones.`
          : 'It stops being offered on the timetable. Nothing else changes.'
      }
      confirmLabel="Remove it"
    />
  );
}
