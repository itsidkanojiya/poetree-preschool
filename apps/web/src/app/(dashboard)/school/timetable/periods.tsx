'use client';

import { useActionState } from 'react';
import { Input, SubmitButton } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import {
  deletePeriodAction,
  updatePeriodAction,
  type TimetableState,
} from './actions';

export interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak: boolean;
  /** Lessons in this period across every class — what a delete would take. */
  lessonCount: number;
}

/**
 * The school day, as a list you can change.
 *
 * It was a form with no list: periods went in and could never be corrected or
 * taken out again, so a period added with the wrong time sat wrong on every
 * class's grid for the rest of the year. You could see them only as row
 * headings on the grid above, where there was nothing to press.
 */
export function PeriodList({ periods }: { periods: Period[] }) {
  if (periods.length === 0) {
    return (
      <p className="pb-2 text-sm text-slate-500">
        None yet. Add the periods your day is actually divided into — the grid above is built
        from them.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-navy-950/[0.06]">
      {periods.map((period) => (
        <li key={period.id} className="py-2">
          <PeriodRow period={period} />
        </li>
      ))}
    </ul>
  );
}

function PeriodRow({ period }: { period: Period }) {
  const [state, formAction] = useActionState<TimetableState, FormData>(
    updatePeriodAction.bind(null, period.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <span className="min-w-[8rem] flex-1">
        <Input
          name="name"
          defaultValue={period.name}
          className="py-1.5 text-sm"
          aria-label={`Name of ${period.name}`}
        />
      </span>
      <span className="w-[5.5rem]">
        <Input
          name="startTime"
          defaultValue={period.startTime}
          placeholder="09:00"
          className="py-1.5 text-sm"
          aria-label={`${period.name} starts`}
        />
      </span>
      <span className="w-[5.5rem]">
        <Input
          name="endTime"
          defaultValue={period.endTime}
          placeholder="09:40"
          className="py-1.5 text-sm"
          aria-label={`${period.name} ends`}
        />
      </span>
      <span className="w-16">
        <Input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={period.sortOrder}
          className="py-1.5 text-sm"
          aria-label={`Order of ${period.name}`}
        />
      </span>

      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          name="isBreak"
          defaultChecked={period.isBreak}
          className="h-3.5 w-3.5 rounded border-navy-300 text-navy-900"
        />
        Break
      </label>

      <SubmitButton variant="secondary" className="px-2.5 py-1 text-xs">
        Save
      </SubmitButton>

      <ConfirmButton
        action={deletePeriodAction.bind(null, period.id)}
        label="Remove"
        title={`Remove “${period.name}”?`}
        // The cost, before the decision. This one cannot be undone from the
        // screen, so it says plainly what goes with it.
        body={
          period.lessonCount > 0
            ? `The whole row goes from every class's timetable, and ${period.lessonCount} ${
                period.lessonCount === 1 ? 'lesson' : 'lessons'
              } in it are deleted with it. This cannot be undone.`
            : 'The row goes from every class’s timetable. Nothing is scheduled in it, so nothing is lost.'
        }
        confirmLabel="Remove the period"
      />

      {state.error && <span className="w-full text-xs text-rose-600">{state.error}</span>}
      <Toast message={state.success} />
    </form>
  );
}
