'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A destructive action, with the consequence stated before it happens.
 *
 * Removing a question was one click with nothing between the pointer and the
 * loss — no undo anywhere in this product, and a question is somebody's
 * afternoon of writing. The dialog is not ceremony: it names what will go and
 * what it takes with it, which is the part a person cannot get back.
 *
 * A portal, so the dialog is not clipped by whatever card the button sits in,
 * and so it is not nested inside a form that submitting it would also submit.
 */
export function ConfirmButton({
  action,
  label,
  title,
  body,
  confirmLabel,
  className,
}: {
  /** A server action, already bound to whatever it acts on. */
  action: () => Promise<void>;
  label: string;
  title: string;
  body: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    // Focus the way out, not the way through: the dialog opens under the
    // pointer, and a stray Enter should not be the thing that deletes.
    cancelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'rounded-lg px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200 transition-colors hover:bg-rose-50'
        }
      >
        {label}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-navy-950/10"
            >
              <h2 id="confirm-title" className="text-lg font-semibold text-navy-950">
                {title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{body}</p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
                >
                  Keep it
                </button>

                <form action={action}>
                  <button
                    type="submit"
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                  >
                    {confirmLabel ?? label}
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
