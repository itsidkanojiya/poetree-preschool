'use client';

import { useActionState, useState } from 'react';
import type { AttendanceSheet, AttendanceStatus } from '@poetree/shared';
import { ATTENDANCE_STATUS_LABELS } from '@poetree/shared';
import { FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import { Avatar, Notice } from '@/components/ui/layout';
import { markAttendanceAction, type AttendanceState } from '../actions';

/**
 * The 30-second screen.
 *
 * Everyone starts Present, so the teacher taps only the children who are not.
 * Status is a segmented control rather than a dropdown — one tap, no menu, and
 * it stays usable one-handed on a phone while a room fills up.
 */
const ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'];

const TONE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-leaf-600 text-white',
  ABSENT: 'bg-rose-600 text-white',
  LATE: 'bg-gold-500 text-navy-950',
  LEAVE: 'bg-navy-600 text-white',
  HALF_DAY: 'bg-slate-500 text-white',
};

export function Register({ sheet }: { sheet: AttendanceSheet }) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(sheet.rows.map((row) => [row.studentId, row.status])),
  );

  const [state, formAction] = useActionState<AttendanceState, FormData>(
    markAttendanceAction.bind(null, sheet.classroomId, sheet.date),
    {},
  );

  if (sheet.isHoliday) {
    return (
      <Notice tone="info" title={sheet.holidayTitle ?? 'Holiday'}>
        The school is closed, so no register is taken. This day is also excluded from attendance
        percentages.
      </Notice>
    );
  }

  if (sheet.rows.length === 0) {
    return (
      <Notice tone="info" title="Nobody is enrolled in this class yet">
        Ask the school office to enrol children before taking a register.
      </Notice>
    );
  }

  const present = Object.values(statuses).filter((s) => s === 'PRESENT').length;
  const absent = sheet.rows.length - present;

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {!sheet.editable && (
        <Notice tone="warning" title="This date can no longer be edited">
          Ask a school administrator to make a correction.
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-navy-50 px-4 py-3 text-sm">
        <span className="font-medium text-navy-950">{sheet.rows.length} children</span>
        <span className="text-leaf-700">{present} present</span>
        {absent > 0 && <span className="text-rose-700">{absent} not present</span>}
        {sheet.alreadyMarked && sheet.markedByName && (
          <span className="ml-auto text-xs text-slate-500">
            Last saved by {sheet.markedByName}
          </span>
        )}
      </div>

      <ul className="divide-y divide-navy-950/[0.06] rounded-xl bg-white ring-1 ring-navy-950/[0.07]">
        {sheet.rows.map((row) => {
          const current = statuses[row.studentId] ?? 'PRESENT';
          return (
            <li key={row.studentId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={row.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-navy-950">{row.fullName}</p>
                <p className="text-xs text-slate-500">
                  {row.rollNo ? `Roll ${row.rollNo} · ` : ''}
                  {row.admissionNo}
                </p>
              </div>

              <input type="hidden" name={`status:${row.studentId}`} value={current} />

              <div className="flex flex-wrap gap-1" role="group" aria-label={`Attendance for ${row.fullName}`}>
                {ORDER.map((status) => {
                  const active = current === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={!sheet.editable}
                      aria-pressed={active}
                      onClick={() =>
                        setStatuses((prev) => ({ ...prev, [row.studentId]: status }))
                      }
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? TONE[status]
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {ATTENDANCE_STATUS_LABELS[status]}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {sheet.editable && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1.5 block text-sm font-medium text-navy-950">Note (optional)</span>
            <Input name="note" defaultValue={sheet.note ?? ''} placeholder="Field trip, late start…" />
          </label>
          <SubmitButton pendingLabel="Saving…">
            {sheet.alreadyMarked ? 'Update register' : 'Save register'}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
