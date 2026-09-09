'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  type RegistrationState,
} from './actions';

/**
 * Approve or turn down, on the row.
 *
 * Approving is the one that creates an account and lets a stranger see a
 * child's records, so it asks first — but it is not a destructive act, and the
 * confirm button's default rose styling would tell the office it was about to
 * break something. It is overridden here; turning down keeps the warning
 * colours, because that one is the refusal.
 */
export function DecideButtons({
  registrationId,
  guardianName,
  studentName,
  matchedName,
}: {
  registrationId: string;
  guardianName: string;
  studentName: string;
  /** The child as the school knows them, which may not be what was typed. */
  matchedName: string;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [state, formAction] = useActionState<RegistrationState, FormData>(
    rejectRegistrationAction.bind(null, registrationId),
    {},
  );

  if (rejecting) {
    return (
      <form action={formAction} className="min-w-[14rem] space-y-1.5">
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
            onClick={() => setRejecting(false)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-navy-900"
          >
            Cancel
          </button>
        </div>
        {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
        <Toast message={state.success} />
      </form>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <ConfirmButton
        action={approveRegistrationAction.bind(null, registrationId)}
        label="Approve"
        title={`Let ${guardianName} in?`}
        body={
          `They will be able to sign in and see everything about ${matchedName} — ` +
          `attendance, fees, homework and photographs. Check that ${guardianName} ` +
          `is really this child's parent before approving; they typed the name as ` +
          `"${studentName}".`
        }
        confirmLabel="Approve"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-leaf-800 ring-1 ring-leaf-300 transition-colors hover:bg-leaf-50"
      />
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 hover:text-navy-900"
      >
        Turn down
      </button>
    </span>
  );
}
