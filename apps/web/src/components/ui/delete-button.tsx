'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';

export interface DeleteState {
  error?: string;
  done?: boolean;
}

/**
 * A permanent delete, with what it takes said first.
 *
 * Every one in the portal goes through this window, so they all read the same:
 * what will be erased, that it cannot be undone, and — for the ones that take
 * the most — the name or number typed back before the button works, which the
 * API checks again. A refusal ("move the children first") is shown here, in
 * the window, not lost in a redirect.
 */
export function DeleteButton({
  action,
  label = 'Delete',
  title,
  body,
  confirmText,
  confirmLabel = 'Delete for good',
  className,
}: {
  /** A server action, bound to what it deletes. It sends `confirm` when one is asked for. */
  action: (prev: DeleteState, formData: FormData) => Promise<DeleteState>;
  label?: string;
  title: string;
  body: ReactNode;
  /** Typed back to unlock the button, when the delete is big enough to warrant it. */
  confirmText?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(
    async (previous, formData) => {
      const next = await action(previous, formData);
      if (next.done) {
        setOpen(false);
        setTyped('');
      }
      return next;
    },
    {},
  );
  const unlocked = !confirmText || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();
  const close = () => {
    setOpen(false);
    setTyped('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'rounded-lg px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600'
        }
      >
        {label}
      </button>

      <Dialog open={open} onClose={close} title={title}>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2 text-sm text-slate-700">{body}</div>
          <p className="text-sm font-medium text-navy-950">This cannot be undone.</p>

          {confirmText && (
            <label className="block text-sm text-navy-950">
              <span className="mb-1.5 block font-medium">
                Type <span className="font-mono">{confirmText}</span> to confirm
              </span>
              <input
                name="confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border-0 px-3.5 py-2.5 font-mono text-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-rose-600"
              />
            </label>
          )}

          {state.error && (
            <p role="alert" className="text-sm font-medium text-rose-700">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
            >
              Keep it
            </button>
            <button
              type="submit"
              disabled={!unlocked || pending}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
            >
              {pending ? 'Deleting…' : confirmLabel}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
