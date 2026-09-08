'use client';

import { useActionState, useState } from 'react';
import { PasswordInput } from '@/components/ui/form';
import { changePasswordAction, type ResetState } from './actions';

/**
 * The office's answer to "I cannot get in".
 *
 * It used to invent a password and show it once, and the person had to choose
 * their own the moment they signed in. The school asked for the opposite: the
 * office types the password, tells them, and that is their password until
 * somebody changes it — so it can be looked up by asking the office, and
 * nobody is made to invent one at the gate.
 *
 * The cost of that is real and is not this component's to hide: whoever runs
 * the office knows a teacher's live password, so an action recorded as that
 * teacher is no longer proof it was them.
 *
 * Closed until asked for. A password box sitting open beside every row invites
 * a stray keystroke into the wrong person's account.
 */
export function ChangePasswordButton({
  kind,
  userId,
  name,
}: {
  kind: 'parents' | 'teachers';
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    changePasswordAction,
    {},
  );

  if (state.done) {
    return (
      <div className="rounded-xl bg-leaf-50 px-3 py-2 ring-1 ring-leaf-200">
        <p className="text-xs font-medium text-leaf-800">Password changed.</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Tell {name.split(' ')[0]} the new one. They are signed out on their other devices.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Set a new password for ${name}`}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Change password
      </button>
    );
  }

  return (
    <form action={formAction} className="min-w-[15rem] space-y-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="userId" value={userId} />

      <PasswordInput
        name="newPassword"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="New password"
        aria-label={`New password for ${name}`}
        className="py-1.5 text-sm"
      />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-navy-900"
        >
          Cancel
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        At least 8 characters, with a letter and a number.
      </p>
      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
