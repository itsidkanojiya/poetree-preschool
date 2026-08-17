'use client';

import { useActionState } from 'react';
import type { ChapterSummary } from '@poetree/shared';
import { FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import {
  createChapterAction,
  deleteChapterAction,
  renameChapterAction,
  type ChapterState,
} from './actions';

/**
 * Adding a chapter, on one line at the end of the list it joins.
 *
 * Was a card of its own below everything else, so writing a contents page meant
 * scrolling to the bottom, typing, and scrolling back to see where it landed.
 * Somebody entering six chapters did that six times. Here the field sits under
 * the last chapter, which is where the next one appears.
 */
export function NewChapterForm({ bookId }: { bookId: string }) {
  const [state, formAction] = useActionState<ChapterState, FormData>(
    createChapterAction.bind(null, bookId),
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14">
          <Input
            name="number"
            type="number"
            min={0}
            max={999}
            placeholder="No."
            className="px-2 py-1.5 text-center text-sm"
            aria-label="Chapter number"
          />
        </span>
        <span className="w-56">
          <Input
            name="name"
            required
            placeholder="Letters A to E"
            className="py-1.5 text-sm"
            aria-label="Chapter name"
          />
        </span>
        <SubmitButton pendingLabel="Adding…">Add chapter</SubmitButton>
      </div>

      <FormError message={state.error} />
      <FormSuccess message={state.success} />
    </form>
  );
}

/** Renaming and renumbering in place — what is actually done often. */
export function ChapterRow({ chapter }: { chapter: ChapterSummary }) {
  const [state, formAction] = useActionState<ChapterState, FormData>(
    renameChapterAction.bind(null, chapter.bookId, chapter.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {/* Width lives on a wrapper, not on the input: Input's own base class is
          w-full, so a w-16 appended after it does not reliably win — which is
          how a compact row ended up as three stretched boxes stacked. */}
      <span className="w-14">
        <Input
          name="number"
          type="number"
          defaultValue={chapter.number ?? ''}
          className="px-2 py-1.5 text-center text-sm"
          aria-label={`Number of ${chapter.name}`}
        />
      </span>
      <span className="w-56">
        <Input
          name="name"
          defaultValue={chapter.name}
          className="py-1.5 text-sm"
          aria-label={`Name of ${chapter.name}`}
        />
      </span>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Save
      </button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

export function DeleteChapterButton({ chapter }: { chapter: ChapterSummary }) {
  const action = deleteChapterAction.bind(null, chapter.bookId, chapter.id);

  return (
    <form action={action}>
      <button
        type="submit"
        // Refused server-side while pages are filed under it, so the count is
        // shown rather than the button hidden.
        title={
          chapter.activityCount > 0
            ? `${chapter.activityCount} question types are in this chapter`
            : undefined
        }
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Remove
      </button>
    </form>
  );
}
