'use client';

import { useActionState } from 'react';
import type { SubjectSummary } from '@poetree/shared';
import { FormError, Input, SubmitButton } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import {
  createSubjectAction,
  renameSubjectAction,
  retireSubjectAction,
  type SubjectState,
} from './subject-actions';

/**
 * The school's own subjects, written on the screen that uses them.
 *
 * There is no shared list to pick from and there deliberately isn't one: one
 * preschool's "Circle time" is another's "Assembly", and a list handed down
 * either imposes one school's words on everybody or fills the picker with
 * thirty names nobody uses. Every name here is this school's.
 *
 * They are the school's, not a class's — the same subject runs in Nursery and
 * in Junior KG, and adding it twice would be two subjects that have to be
 * renamed twice. Each row says how far it reaches, so removing one is a
 * decision made with the cost in front of you.
 */
export function SubjectList({ subjects }: { subjects: SubjectSummary[] }) {
  return (
    <div className="space-y-1">
      {subjects.length === 0 ? (
        <p className="pb-2 text-sm text-slate-500">
          None yet. Add the four or five a day is actually made of — circle time, letters,
          numbers, rhymes, play.
        </p>
      ) : (
        <ul className="divide-y divide-navy-950/[0.06]">
          {subjects.map((subject) => (
            <li key={subject.id} className="py-2">
              <SubjectRow subject={subject} />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-navy-950/[0.06] pt-3">
        <NewSubjectForm />
      </div>
    </div>
  );
}

/** Where a subject has got to, said in words rather than two bare numbers. */
function reach(subject: SubjectSummary): string {
  if (subject.timetableCount === 0) return 'Not on any grid yet';

  const periods = `${subject.timetableCount} ${
    subject.timetableCount === 1 ? 'period' : 'periods'
  }`;
  const classes = `${subject.classroomCount} ${
    subject.classroomCount === 1 ? 'class' : 'classes'
  }`;

  return `${periods} in ${classes}`;
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const [state, formAction] = useActionState<SubjectState, FormData>(
    renameSubjectAction.bind(null, subject.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <span className="min-w-[10rem] flex-1">
        <Input
          name="name"
          defaultValue={subject.name}
          className="py-1.5 text-sm"
          aria-label={`Name of ${subject.name}`}
        />
      </span>

      {/* Before the buttons, because it is what the buttons are about. */}
      <span className="text-xs text-slate-500">{reach(subject)}</span>

      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Save
      </button>

      <RetireSubjectButton subject={subject} />

      {state.error && <span className="w-full text-xs text-rose-600">{state.error}</span>}
      <Toast message={state.success} />
    </form>
  );
}

function NewSubjectForm() {
  const [state, formAction] = useActionState<SubjectState, FormData>(createSubjectAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <span className="min-w-[10rem] flex-1">
        <Input
          name="name"
          required
          placeholder="Circle time"
          className="py-1.5 text-sm"
          aria-label="New subject"
        />
      </span>
      <SubmitButton pendingLabel="Adding…">Add subject</SubmitButton>

      <span className="w-full">
        <FormError message={state.error} />
      </span>
      <Toast message={state.success} />
    </form>
  );
}

function RetireSubjectButton({ subject }: { subject: SubjectSummary }) {
  return (
    <ConfirmButton
      action={retireSubjectAction.bind(null, subject.id)}
      label="Remove"
      title={`Remove “${subject.name}”?`}
      // The cost, before the decision. A subject on three classes is three
      // timetables somebody has to think about.
      body={
        subject.timetableCount > 0
          ? `It is on ${reach(subject).toLowerCase()}. Those periods keep it — it simply stops being offered for new ones.`
          : 'It stops being offered on the timetable. Nothing else changes.'
      }
      confirmLabel="Remove it"
    />
  );
}
