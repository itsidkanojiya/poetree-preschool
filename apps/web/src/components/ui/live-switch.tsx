'use client';

/**
 * Whether a thing is in use, as a switch rather than a button.
 *
 * Every one of these screens had a button reading "Retire", which named what
 * would happen to the button and not what was true of the row. It looked
 * identical in both states, so the only way to read the state was to read the
 * word and invert it. A switch shows the state before anybody touches it, and
 * the sentence beside it says what turning it off actually does — which in this
 * system is never a delete.
 */
export function LiveSwitch({
  on,
  action,
  onTitle,
  offTitle,
  onNote,
  offNote,
  label,
  blockedReason,
}: {
  on: boolean;
  /** A server action already bound to the row and the state being moved to. */
  action: () => Promise<void>;
  onTitle: string;
  offTitle: string;
  onNote: string;
  offNote: string;
  /** For a screen reader, which has only this to go on. */
  label: string;
  /**
   * Why turning this off will be refused, when the server would refuse it.
   * Shown rather than hidden: a control that does nothing with no reason given
   * is worse than an answer.
   */
  blockedReason?: string;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-950">{on ? onTitle : offTitle}</p>
        <p className="mt-0.5 max-w-md text-xs text-slate-500">{on ? onNote : offNote}</p>
        {on && blockedReason && <p className="mt-1 text-xs text-amber-700">{blockedReason}</p>}
      </div>

      {/* A submit button drawn as a switch: no client state to hold in step
          with the server, and it still works before React has loaded. */}
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative h-7 w-12 shrink-0 rounded-full ring-1 transition-colors ${
          on
            ? 'bg-navy-900 ring-navy-900 hover:bg-navy-800'
            : 'bg-slate-200 ring-navy-950/10 hover:bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            on ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </form>
  );
}
