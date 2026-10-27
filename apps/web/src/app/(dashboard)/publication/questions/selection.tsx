'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { deleteActivitiesAction } from './actions';

/**
 * Ticking activities on the list to remove several at once.
 *
 * The table itself is drawn on the server; only the boxes and the bar above
 * it live here, sharing which rows are ticked. Ticks are kept only for rows
 * still on the page, so after a delete — or on the next page — nothing stale
 * stays ticked.
 */

interface Selection {
  ids: string[];
  selected: string[];
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error('Inside a SelectionProvider only');
  return selection;
}

/** Holds the ticks for the rows on this page, [ids], in order. */
export function SelectionProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(() => ids.filter((id) => chosen.has(id)), [ids, chosen]);

  const value = useMemo<Selection>(
    () => ({
      ids,
      selected,
      toggle: (id) =>
        setChosen((before) => {
          const next = new Set(before);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setAll: (on) => setChosen(on ? new Set(ids) : new Set()),
      clear: () => setChosen(new Set()),
    }),
    [ids, selected],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

const BOX = 'h-4 w-4 cursor-pointer rounded border-navy-300 text-navy-900 focus:ring-navy-400';

/** The header's box: ticks every row on this page, or none. */
export function SelectAll() {
  const { ids, selected, setAll } = useSelection();
  const ref = useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && selected.length === ids.length;
  const some = selected.length > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={BOX}
      checked={all}
      onChange={() => setAll(!all)}
      aria-label={all ? 'Untick every activity on this page' : 'Tick every activity on this page'}
    />
  );
}

/** One row's box. */
export function RowCheck({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      className={BOX}
      checked={selected.includes(id)}
      onChange={() => toggle(id)}
      aria-label={`Tick “${label}”`}
    />
  );
}

/**
 * Above the table once something is ticked: how many, a way to untick them,
 * and Delete — which asks first, because there is no undo.
 */
export function BulkBar() {
  const { ids, selected, setAll, clear } = useSelection();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  // A result stays until the next thing is ticked.
  useEffect(() => {
    if (selected.length > 0) setMessage(null);
  }, [selected.length]);

  const remove = () =>
    startTransition(async () => {
      const count = selected.length;
      try {
        const { deleted, failed } = await deleteActivitiesAction(selected);
        clear();
        setConfirming(false);
        setMessage(
          failed === 0
            ? {
                text: `${deleted} ${deleted === 1 ? 'activity' : 'activities'} deleted.`,
                bad: false,
              }
            : {
                text: `${deleted} deleted. ${failed} could not be deleted — try those again.`,
                bad: true,
              },
        );
      } catch {
        setConfirming(false);
        setMessage({
          text: `The ${count} activities could not be deleted. Check your connection and try again.`,
          bad: true,
        });
      }
    });

  if (selected.length === 0) {
    return message ? (
      <p
        role="status"
        className={`mb-3 rounded-xl px-4 py-2.5 text-sm ${
          message.bad
            ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
            : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
        }`}
      >
        {message.text}
      </p>
    ) : null;
  }

  const count = selected.length;
  const noun = count === 1 ? 'activity' : 'activities';

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-navy-50 px-4 py-2.5 ring-1 ring-navy-200">
      <span className="text-sm font-medium text-navy-950">
        {count} {noun} selected
      </span>
      {count < ids.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="text-sm font-medium text-navy-900 underline-offset-2 hover:underline"
        >
          Select all {ids.length} on this page
        </button>
      )}
      <button
        type="button"
        onClick={clear}
        className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ml-auto rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
      >
        Delete {count} {noun}
      </button>

      {confirming && (
        <ConfirmDelete
          count={count}
          noun={noun}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

/** "Delete 3 activities?" — the consequence first, the way out focused. */
function ConfirmDelete({
  count,
  noun,
  pending,
  onCancel,
  onConfirm,
}: {
  count: number;
  noun: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-navy-950/10"
      >
        <h2 id="bulk-delete-title" className="text-lg font-semibold text-navy-950">
          Delete {count} {noun}?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {count === 1 ? 'It goes' : 'They go'}, along with {count === 1 ? 'its' : 'their'} choices,
          pictures and strokes. Children stop seeing {count === 1 ? 'it' : 'them'} at once. There is
          no undo.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl px-4 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 disabled:opacity-50"
          >
            Keep {count === 1 ? 'it' : 'them'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? 'Deleting…' : `Delete ${count} ${noun}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
