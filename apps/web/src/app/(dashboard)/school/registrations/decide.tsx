'use client';

import { useActionState, useState } from 'react';
import { GENDERS, type StudentMatch } from '@poetree/shared';
import { Input, Select } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  type RegistrationState,
} from './actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Approve or turn down, on the row.
 *
 * Approving is where the child is decided, because that is where the office
 * actually knows: the family asked to join and named a child, and it is the
 * office that says whether that is a pupil already on the roll — a sibling, or
 * one entered last week — or a record to create now. Everything a new record
 * needs is on this panel so that saying yes is one step and not two.
 */
export function DecideButtons({
  registrationId,
  guardianName,
  studentName,
  matches,
  classrooms,
}: {
  registrationId: string;
  guardianName: string;
  studentName: string;
  /** Children already on the roll who might be the one described. */
  matches: StudentMatch[];
  classrooms: Array<{ id: string; label: string }>;
}) {
  const [mode, setMode] = useState<'idle' | 'approving' | 'rejecting'>('idle');
  // Empty means "a child the school does not have yet".
  const [studentId, setStudentId] = useState(matches[0]?.id ?? '');

  const [rejectState, rejectAction] = useActionState<RegistrationState, FormData>(
    rejectRegistrationAction.bind(null, registrationId),
    {},
  );
  const [approveState, approveAction] = useActionState<RegistrationState, FormData>(
    approveRegistrationAction.bind(null, registrationId),
    {},
  );

  if (mode === 'rejecting') {
    return (
      <form action={rejectAction} className="min-w-[14rem] space-y-1.5">
        <Input
          name="reason"
          placeholder="Why, in a few words (optional)"
          className="py-1.5 text-sm"
          aria-label={`Why ${guardianName} is being turned down`}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700"
          >
            Turn down
          </button>
          <button
            type="button"
            onClick={() => setMode('idle')}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-navy-900"
          >
            Cancel
          </button>
        </div>
        {rejectState.error && <p className="text-xs text-rose-600">{rejectState.error}</p>}
        <Toast message={rejectState.success} />
      </form>
    );
  }

  if (mode === 'approving') {
    return (
      <form action={approveAction} className="min-w-[19rem] space-y-2.5 text-left">
        <p className="text-xs text-slate-500">
          They will see everything about this child — attendance, fees, homework and
          photographs. Which child is <span className="font-medium text-navy-950">{studentName}</span>?
        </p>

        <div className="space-y-1.5">
          {matches.map((match) => (
            <label
              key={match.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 ring-1 ring-navy-950/10 has-[:checked]:bg-navy-50 has-[:checked]:ring-navy-900"
            >
              <input
                type="radio"
                name="studentId"
                value={match.id}
                checked={studentId === match.id}
                onChange={() => setStudentId(match.id)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span className="text-xs">
                <span className="block font-medium text-navy-950">{match.name}</span>
                <span className="block text-slate-500">
                  {match.admissionNo}
                  {match.classroom && <> · {match.classroom}</>} ·{' '}
                  {new Date(match.dateOfBirth).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </span>
            </label>
          ))}

          <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 ring-1 ring-navy-950/10 has-[:checked]:bg-navy-50 has-[:checked]:ring-navy-900">
            <input
              type="radio"
              name="studentId"
              value=""
              checked={studentId === ''}
              onChange={() => setStudentId('')}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span className="text-xs">
              <span className="block font-medium text-navy-950">
                {matches.length > 0 ? 'None of these — add the child' : 'Add this child'}
              </span>
              <span className="block text-slate-500">
                Creates the record and issues an admission number.
              </span>
            </span>
          </label>
        </div>

        {/* Only what a new record cannot be created without. Everything else
            about the child can be filled in afterwards on their own page. */}
        {studentId === '' && (
          <div className="space-y-1.5">
            <Select name="gender" required defaultValue="" className="py-1.5 text-xs">
              <option value="" disabled>
                Boy or girl?
              </option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {titleCase(gender)}
                </option>
              ))}
            </Select>

            <Select name="classroomId" defaultValue="" className="py-1.5 text-xs">
              <option value="">No class yet</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.label}
                </option>
              ))}
            </Select>

            <Input
              name="admissionNo"
              placeholder="Admission number (issued automatically)"
              className="py-1.5 text-xs"
              aria-label="Admission number"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-leaf-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-leaf-800"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setMode('idle')}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-navy-900"
          >
            Cancel
          </button>
        </div>

        {approveState.error && <p className="text-xs text-rose-600">{approveState.error}</p>}
        <Toast message={approveState.success} />
      </form>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMode('approving')}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-leaf-800 ring-1 ring-leaf-300 transition-colors hover:bg-leaf-50"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => setMode('rejecting')}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 hover:text-navy-900"
      >
        Turn down
      </button>
    </span>
  );
}
