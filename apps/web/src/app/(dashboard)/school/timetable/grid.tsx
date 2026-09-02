'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Field, FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { Toast } from '@/components/ui/toast';
import { IconGrip } from '@/components/icons';
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

interface Cell {
  subjectId: string;
  teacherId: string;
  roomId: string;
}

const EMPTY: Cell = { subjectId: '', teacherId: '', roomId: '' };

const isEmpty = (cell: Cell) => !cell.subjectId && !cell.teacherId && !cell.roomId;

/**
 * The weekly grid: days across, periods down.
 *
 * Each cell is three selects rather than a modal. Filling a week is already
 * thirty decisions; making each one cost a dialog would guarantee nobody ever
 * completes it.
 *
 * A lesson can also be dragged from one slot to another, which is how a week is
 * actually rearranged — "move Tuesday's letters to Thursday" was six select
 * changes and a good chance of leaving the old slot half-cleared. Dragging onto
 * an occupied slot swaps the two, because that is nearly always what moving a
 * lesson in a full week means.
 *
 * Everything stays local until Save. The week is one thing, and a grid that
 * wrote each change as it happened would leave a half-rearranged timetable live
 * in front of parents while somebody was still thinking.
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

  const saved = useMemo(() => {
    const map: Record<string, Cell> = {};
    for (const entry of entries) {
      map[`${entry.dayOfWeek}:${entry.periodId}`] = {
        subjectId: entry.subject?.id ?? '',
        teacherId: entry.teacher?.id ?? '',
        roomId: entry.room?.id ?? '',
      };
    }
    return map;
  }, [entries]);

  const [cells, setCells] = useState<Record<string, Cell>>(saved);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // What the server last told us is the truth. A save revalidates the page and
  // new entries arrive as props; without this the grid would keep showing the
  // state it had before the save, including anything the server refused.
  useEffect(() => setCells(saved), [saved]);

  if (periods.length === 0) {
    return (
      <Notice tone="info" title="Define the school day first">
        Add the periods below — the grid is built from them.
      </Notice>
    );
  }

  const at = (key: string): Cell => cells[key] ?? EMPTY;

  const set = (key: string, next: Cell) =>
    setCells((prev) => ({ ...prev, [key]: next }));

  const move = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setCells((prev) => ({
      ...prev,
      [toKey]: prev[fromKey] ?? EMPTY,
      // A swap rather than a copy: the lesson that was there has to go
      // somewhere, and silently dropping it is how a week loses a period
      // nobody notices until Monday.
      [fromKey]: prev[toKey] ?? EMPTY,
    }));
  };

  const changed = Object.keys({ ...saved, ...cells }).some((key) => {
    const a = saved[key] ?? EMPTY;
    const b = cells[key] ?? EMPTY;
    return (
      a.subjectId !== b.subjectId ||
      a.teacherId !== b.teacherId ||
      a.roomId !== b.roomId
    );
  });

  const cellSelect =
    'w-full rounded-md border-0 bg-white px-1.5 py-1 text-xs ring-1 ring-inset ring-navy-950/10 focus:ring-2 focus:ring-inset focus:ring-navy-600';

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

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

                  const key = `${day.value}:${period.id}`;
                  const cell = at(key);
                  const prefix = `cell:${key}`;
                  const filled = !isEmpty(cell);
                  const isTarget = over === key && dragging !== null && dragging !== key;

                  return (
                    <td
                      key={day.value}
                      onDragOver={(event) => {
                        // Without this the drop is never allowed to happen.
                        event.preventDefault();
                        setOver(key);
                      }}
                      onDragLeave={() => setOver((current) => (current === key ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragging) move(dragging, key);
                        setDragging(null);
                        setOver(null);
                      }}
                      className={`rounded-lg p-1.5 align-top ring-1 transition-colors ${
                        isTarget
                          ? 'bg-navy-50 ring-2 ring-navy-400'
                          : 'bg-white ring-navy-950/[0.06]'
                      } ${dragging === key ? 'opacity-40' : ''}`}
                    >
                      <div className="mb-1 flex h-4 items-center justify-between">
                        {filled ? (
                          <span
                            draggable
                            onDragStart={() => setDragging(key)}
                            onDragEnd={() => {
                              setDragging(null);
                              setOver(null);
                            }}
                            title="Drag to another day or period"
                            className="cursor-grab text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                          >
                            <IconGrip size={14} />
                          </span>
                        ) : (
                          <span />
                        )}

                        {filled && (
                          <button
                            type="button"
                            onClick={() => set(key, EMPTY)}
                            title="Clear this slot"
                            aria-label={`Clear ${day.label}, ${period.name}`}
                            className="rounded px-1 text-xs font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="space-y-1">
                        <select
                          name={`${prefix}:subject`}
                          value={cell.subjectId}
                          onChange={(event) =>
                            set(key, { ...cell, subjectId: event.target.value })
                          }
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
                          value={cell.teacherId}
                          onChange={(event) =>
                            set(key, { ...cell, teacherId: event.target.value })
                          }
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
                            value={cell.roomId}
                            onChange={(event) =>
                              set(key, { ...cell, roomId: event.target.value })
                            }
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
        Drag a lesson by its handle to move it to another day or period; dropping it on a full slot
        swaps the two. ✕ clears a slot. A teacher or room already booked elsewhere in the same
        period is refused on save, naming the class it clashes with.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save timetable</SubmitButton>

        {changed && (
          <>
            <button
              type="button"
              onClick={() => setCells(saved)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
            >
              Undo changes
            </button>
            {/* Said plainly, because the grid looks saved either way and a week
                rearranged and then abandoned is a week nobody teaches. */}
            <span className="text-xs font-medium text-amber-700">Not saved yet</span>
          </>
        )}
      </div>
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
