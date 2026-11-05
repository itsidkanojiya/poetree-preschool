'use client';

import { useFormStatus } from 'react-dom';

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Restore ${name}`}
      className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      {pending ? 'Restoring…' : 'Restore'}
    </button>
  );
}

/**
 * Putting someone back. No dialog: nothing is lost by it, and a removal done
 * by mistake should be one click to undo.
 */
export function RestoreButton({ action, name }: { action: () => Promise<void>; name: string }) {
  return (
    <form action={action}>
      <Submit name={name} />
    </form>
  );
}
