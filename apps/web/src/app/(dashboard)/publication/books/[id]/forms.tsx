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
export function ChapterFields({
  chapter,
  position,
}: {
  chapter: ChapterSummary;
  /**
   * Where the row sits right now, which is what the badge shows.
   *
   * Taken from the list rather than from the stored number so the contents page
   * renumbers itself the moment a chapter is dragged, instead of waiting for
   * the save to come back — the wait is exactly when it reads 1, 3, 2.
   */
  position: number;
}) {
  const film = chapter.animation?.url ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="chapterId" value={chapter.id} />
      <input type="hidden" name="before" value={`${chapter.name}|${film}`} />

      {/* The number is where the chapter sits, so it is shown rather than
          typed. Asking for both the position and the number is asking the same
          question twice, which is how a contents page ends up reading 1, 3, 2. */}
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-sm font-semibold text-navy-900"
        aria-label={`Chapter ${position}`}
      >
        {position}
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
