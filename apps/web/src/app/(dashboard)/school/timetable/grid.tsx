'use client';

import { useActionState } from 'react';
import { Field, FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { createPeriodAction, saveTimetableAction, type TimetableState } from './actions';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

interface Entry {
  dayOfWeek: number;
  periodId: string;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
}

interface Option {
  id: string;
  name: string;
}

/**
 * The weekly grid: days across, periods down.
 *
 * Each cell is three selects rather than a modal. Filling a week is already
 * thirty decisions; making each one cost a dialog would guarantee nobody ever
 * completes it.
 */
export function TimetableGrid({
  classroomId,
  periods,
  entries,
  subjects,
  teachers,
  rooms,
}: {
  classroomId: string;
  periods: Period[];
  entries: Entry[];
  subjects: Option[];
  teachers: Option[];
  rooms: Option[];
}) {
  const [state, formAction] = useActionState<TimetableState, FormData>(
    saveTimetableAction.bind(null, classroomId),
    {},
  );

  if (periods.length === 0) {
    return (
      <Notice tone="info" title="Define the school day first">
        Add the periods below — the grid is built from them.
      </Notice>
    );
  }

  const byCell = new Map(entries.map((e) => [`${e.dayOfWeek}:${e.periodId}`, e]));

  const cellSelect = 'w-full rounded-md border-0 bg-white px-1.5 py-1 text-xs ring-1 ring-inset ring-navy-950/10 focus:ring-2 focus:ring-inset focus:ring-navy-600';

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[900px] border-separate border-spacing-1 text-left">
          <thead>
            <tr>
              <th className="w-28 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Period
              </th>
              {DAYS.map((day) => (
                <th
                  key={day.value}
                  className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <th scope="row" className="align-top">
                  <span className="block text-sm font-medium text-navy-950">{period.name}</span>
                  <span className="block text-xs text-slate-500">
                    {period.startTime}–{period.endTime}
                  </span>
                </th>

                {DAYS.map((day) => {
                  if (period.isBreak) {
                    return (
                      <td
                        key={day.value}
                        className="rounded-lg bg-slate-50 px-2 py-3 text-center text-xs text-slate-400"
                      >
                        Break
                      </td>
                    );
                  }

                  const cell = byCell.get(`${day.value}:${period.id}`);
                  const prefix = `cell:${day.value}:${period.id}`;

                  return (
                    <td key={day.value} className="rounded-lg bg-white p-1.5 align-top ring-1 ring-navy-950/[0.06]">
                      <div className="space-y-1">
                        <select
                          name={`${prefix}:subject`}
                          defaultValue={cell?.subject?.id ?? ''}
                          className={cellSelect}
                          aria-label={`Subject, ${day.label}, ${period.name}`}
                        >
                          <option value="">—</option>
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>

                        <select
                          name={`${prefix}:teacher`}
                          defaultValue={cell?.teacher?.id ?? ''}
                          className={cellSelect}
                          aria-label={`Teacher, ${day.label}, ${period.name}`}
                        >
                          <option value="">No teacher</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>

                        {rooms.length > 0 && (
                          <select
                            name={`${prefix}:room`}
                            defaultValue={cell?.room?.id ?? ''}
                            className={cellSelect}
                            aria-label={`Room, ${day.label}, ${period.name}`}
                          >
                            <option value="">No room</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        A teacher or room already booked elsewhere in the same period is refused on save, naming the
        class it clashes with.
      </p>

      <SubmitButton pendingLabel="Saving…">Save timetable</SubmitButton>
    </form>
  );
}

export function NewPeriodForm({ academicYearId }: { academicYearId: string }) {
  const [state, formAction] = useActionState<TimetableState, FormData>(createPeriodAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <input type="hidden" name="academicYearId" value={academicYearId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input name="name" required placeholder="Period 1" />
        </Field>
        <Field label="Order" required hint="Lower numbers appear higher in the grid.">
          <Input name="sortOrder" type="number" min={0} defaultValue={0} required />
        </Field>
        <Field label="Starts" required>
          <Input name="startTime" placeholder="09:00" pattern="\d{2}:\d{2}" required />
        </Field>
        <Field label="Ends" required>
          <Input name="endTime" placeholder="09:40" pattern="\d{2}:\d{2}" required />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-slate-700">
        <input type="checkbox" name="isBreak" className="h-4 w-4 rounded border-navy-300 text-navy-900" />
        This is a break — no subject or teacher
      </label>

      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add period
      </SubmitButton>
    </form>
  );
}
