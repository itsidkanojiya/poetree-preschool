'use client';

import { useActionState } from 'react';
import type { PasswordResetResponse } from '@poetree/shared';
import { resetPasswordAction, type ResetState } from './actions';

/**
 * The office's answer to "I cannot get in".
 *
 * The temporary password is shown once, here, and stored nowhere — reload the
 * page and it is gone, which is deliberate. If it is lost, reset again.
 */
export function ResetPasswordButton({
  kind,
  userId,
  name,
}: {
  kind: 'parents' | 'teachers';
  userId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    {},
  );

  if (state.reset) {
    return <IssuedPassword reset={state.reset} />;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        // No confirmation dialog: the destructive part is not the new password
        // but the sessions it ends, and the sentence below says so.
        title={`Set a new password for ${name} and sign them out everywhere`}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 disabled:opacity-50"
      >
        {pending ? 'Resetting…' : 'Reset password'}
      </button>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

function IssuedPassword({ reset }: { reset: PasswordResetResponse }) {
  return (
    <div className="rounded-xl bg-leaf-50 px-3 py-2 ring-1 ring-leaf-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-leaf-700">
        Read this to {reset.name.split(' ')[0]}
      </p>
      <p className="select-all font-mono text-sm font-semibold text-navy-950">
        {reset.temporaryPassword}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Shown once. They must choose their own when they sign in.
      </p>
    </div>
  );
}
