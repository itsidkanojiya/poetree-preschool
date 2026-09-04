'use client';

import { useActionState, useEffect, useState } from 'react';
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
        <ChapterCoverPicker chapterName="the new chapter" />
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
 * The chapter's picture: choose it by clicking the thing it will replace.
 *
 * A file input on every row of a twelve-chapter contents page is twelve grey
 * "Choose file" buttons and no idea which chapters already have artwork. The
 * thumbnail is the control instead — it shows what is there, and clicking it
 * asks for a new one.
 *
 * Nothing uploads here. The picture goes up with the one Save at the bottom,
 * like every other field on this page, which is why the preview matters: it is
 * the only thing that says a picture was chosen at all.
 */
function ChapterCoverPicker({
  chapterId,
  chapterName,
  coverUrl,
}: {
  /** Empty on the "add a chapter" row, which has no id and nothing to clear. */
  chapterId?: string;
  chapterName: string;
  coverUrl?: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Object URLs are held by the browser until they are handed back.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const stored = coverUrl?.split('/').pop();
  const showing = preview ?? (stored ? `/attachments?kind=catalogue&id=${stored}` : null);

  return (
    <span className="relative shrink-0">
      <label
        className={`grid h-11 w-9 cursor-pointer place-items-center overflow-hidden rounded-md ring-1 ring-navy-950/10 transition-opacity hover:opacity-80 ${
          showing ? '' : 'border border-dashed border-slate-300 bg-slate-50'
        } ${removing ? 'opacity-30' : ''}`}
        title={showing ? `Change the picture for ${chapterName}` : `Add a picture for ${chapterName}`}
      >
        {showing ? (
          /* A plain img: one small picture from our own API, and next/image
             would want a loader configured for the host. */
          <img src={showing} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-base leading-none text-slate-400">+</span>
        )}
        <input
          type="file"
          name="cover"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={`Picture for ${chapterName}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
            // Choosing a new one is not also asking to take the old one off.
            if (file) setRemoving(false);
          }}
        />
      </label>

      {/* Only when there is something to take off, and not while a replacement
          is already waiting to be saved. */}
      {chapterId && stored && !preview && (
        <label
          className={`absolute -right-1.5 -top-1.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-white text-[9px] font-bold leading-none ring-1 transition-colors ${
            removing ? 'text-rose-600 ring-rose-300' : 'text-slate-400 ring-navy-950/10 hover:text-rose-600'
          }`}
          title={removing ? 'Will be taken off when you save' : 'Take this picture off'}
        >
          <input
            type="checkbox"
            name="removeCover"
            value={chapterId}
            className="sr-only"
            onChange={(event) => setRemoving(event.target.checked)}
          />
          <span aria-hidden>✕</span>
          <span className="sr-only">Take the picture off {chapterName}</span>
        </label>
      )}
    </span>
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

      {/* Optional, and shown as what it is. A chapter with no picture keeps its
          own colour in the app, so an unillustrated book is not a broken one. */}
      <ChapterCoverPicker
        chapterId={chapter.id}
        chapterName={chapter.name}
        coverUrl={chapter.coverUrl}
      />

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
