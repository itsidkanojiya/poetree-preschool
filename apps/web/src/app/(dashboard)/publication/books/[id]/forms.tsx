'use client';

import { useActionState } from 'react';
import type { ChapterSummary } from '@poetree/shared';
import { FormError, Input, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import { ConfirmButton } from '@/components/ui/confirm-button';
import {
  createChapterAction,
  deleteChapterAction,
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
        <span className="min-w-[13rem] flex-1">
          <Input
            name="animationUrl"
            placeholder="Film — https://youtu.be/… (optional)"
            className="py-1.5 text-sm"
            aria-label="Film for this chapter"
          />
        </span>
        <SubmitButton pendingLabel="Adding…">Add chapter</SubmitButton>
      </div>

      <FormError message={state.error} />
      <Toast message={state.success} />
    </form>
  );
}

/**
 * One chapter's fields, inside the list's single form.
 *
 * This used to be a form of its own with its own Save, so correcting three
 * chapter names meant three clicks and three reloads. The fields are named as
 * arrays and carry their id, so the whole contents page is saved at once.
 *
 * `before` is what the row looked like when the page was drawn — the action
 * compares against it and sends only what actually changed.
 */
export function ChapterFields({ chapter }: { chapter: ChapterSummary }) {
  const film = chapter.animation?.url ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="chapterId" value={chapter.id} />
      <input
        type="hidden"
        name="before"
        value={`${chapter.number ?? ''}|${chapter.name}|${film}`}
      />

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
      {/* The film that opens this chapter. Beside the name because it is part
          of what the chapter is, not a separate screen to remember. */}
      <span className="min-w-[13rem] flex-1">
        <Input
          name="animationUrl"
          defaultValue={film}
          placeholder="Film — https://youtu.be/… (optional)"
          className="py-1.5 text-sm"
          aria-label={`Film for ${chapter.name}`}
        />
      </span>
    </div>
  );
}

export function DeleteChapterButton({ chapter }: { chapter: ChapterSummary }) {
  return (
    <ConfirmButton
      action={deleteChapterAction.bind(null, chapter.bookId, chapter.id)}
      label="Remove"
      title={`Remove “${chapter.name}”?`}
      // Refused server-side while pages are filed under it, so the reason is
      // said here rather than the button hidden.
      body={
        chapter.activityCount > 0
          ? `${chapter.activityCount} question ${
              chapter.activityCount === 1 ? 'type is' : 'types are'
            } filed under this chapter, so this will be refused until they move. Nothing is lost by trying.`
          : 'The chapter goes. Nothing is filed under it, so nothing else changes.'
      }
      confirmLabel="Remove the chapter"
    />
  );
}
