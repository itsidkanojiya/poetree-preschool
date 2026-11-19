'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { ChapterSummary } from '@poetree/shared';
import { Pill } from '@/components/ui/layout';
import { IconChevronRight, IconGrip } from '@/components/icons';
import { reorderChaptersAction, saveChaptersAction, type ChapterState } from './actions';
import { ChapterFields, DeleteChapterButton } from './forms';
import { ChapterPdf } from './chapter-pdf';
import { SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';

export interface ChapterPage {
  id: string;
  title: string;
  itemCount: number;
  chapterId: string | null;
}

/**
 * The contents page, in the order it runs — and draggable into another one.
 *
 * Chapter numbers were typed into a box one at a time, which meant renumbering
 * a whole book by hand to insert a chapter in the middle, and holding the new
 * numbering in your head while you did it. Dragging says the same thing by
 * showing it.
 *
 * The order is applied here first and sent afterwards. A list that snaps back
 * to where it was while the request is in flight is worse than one that is
 * briefly optimistic — and if the save fails, the server's own order arrives
 * on the next render and puts it right.
 */
export function ChapterList({
  bookId,
  chapters,
  pages,
}: {
  bookId: string;
  chapters: ChapterSummary[];
  pages: ChapterPage[];
}) {
  const [order, setOrder] = useState(chapters);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ChapterState, FormData>(
    saveChaptersAction.bind(null, bookId),
    {},
  );

  // The server is the authority. When a save lands — or somebody renames a
  // chapter and the page revalidates — take what it says.
  useEffect(() => setOrder(chapters), [chapters]);

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;

    const next = [...order];
    const from = next.findIndex((row) => row.id === fromId);
    const to = next.findIndex((row) => row.id === toId);
    if (from === -1 || to === -1) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);

    setOrder(next);
    startTransition(() => {
      void reorderChaptersAction(
        bookId,
        next.map((row) => row.id),
      );
    });
  };

  // The same move without dragging: a button press works from a keyboard, a
  // switch device or a shaky hand, which a drag does not (WCAG 2.2, 2.5.7).
  const step = (id: string, by: -1 | 1) => {
    const index = order.findIndex((row) => row.id === id);
    const target = order[index + by];
    if (target) move(id, target.id);
  };

  return (
    <form action={formAction}>
      <Toast message={state.success} />
      <Toast message={state.error} tone="bad" />

      <ul className={pending ? 'opacity-60' : ''}>
      {order.map((chapter, position) => {
        const inside = pages.filter((page) => page.chapterId === chapter.id);

        return (
          <li
            key={chapter.id}
            draggable
            onDragStart={() => setDragging(chapter.id)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              // Without this the drop is never allowed to happen.
              event.preventDefault();
              setOver(chapter.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging) move(dragging, chapter.id);
              setDragging(null);
              setOver(null);
            }}
            className={`rounded-xl border border-transparent px-2 py-3 transition-colors ${
              dragging === chapter.id ? 'opacity-40' : ''
            } ${over === chapter.id && dragging !== chapter.id ? 'border-navy-300 bg-navy-50/60' : ''}`}
          >
            {/* Handle and arrows stay beside the chapter on a phone; the
                fields wrap within the space left, not onto a line of their own. */}
            <div className="flex items-center gap-3">
              <span
                className="cursor-grab text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                aria-hidden
              >
                <IconGrip size={16} />
              </span>
              <span className="flex flex-col">
                <button
                  type="button"
                  onClick={() => step(chapter.id, -1)}
                  disabled={position === 0 || pending}
                  aria-label={`Move ${chapter.name} up`}
                  title="Move up"
                  className="grid h-6 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-navy-50 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <IconChevronRight size={14} className="-rotate-90" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => step(chapter.id, 1)}
                  disabled={position === order.length - 1 || pending}
                  aria-label={`Move ${chapter.name} down`}
                  title="Move down"
                  className="grid h-6 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-navy-50 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <IconChevronRight size={14} className="rotate-90" aria-hidden="true" />
                </button>
              </span>

              <div className="min-w-0 flex-1">
                <ChapterFields chapter={chapter} position={position + 1} />
              </div>
            </div>

            {/* Under the name: the chapter's PDF on the left, what it holds and
                what can be done to it on the right — one line, not three. */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 md:ml-[4.25rem]">
              <ChapterPdf bookId={bookId} chapter={chapter} />
              <span className="flex flex-wrap items-center gap-2">
                {chapter.questionCount === 0 ? (
                  /* Named but not written: the state worth seeing at a glance,
                     because it looks finished from the outside. */
                  <Pill tone="neutral">Nothing written yet</Pill>
                ) : (
                  <Pill tone="brand">
                    {chapter.questionCount} {chapter.questionCount === 1 ? 'activity' : 'activities'}
                  </Pill>
                )}
                {/* Straight to choosing a type: the book and chapter are this. */}
                <Link
                  href={`/publication/questions/new?bookId=${bookId}&chapterId=${chapter.id}`}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                >
                  + Add activity
                </Link>
                <DeleteChapterButton chapter={chapter} />
              </span>
            </div>

            {inside.length > 0 && (
              <ul className="mt-2 space-y-1 border-l-2 border-navy-950/[0.06] pl-4 md:ml-7">
                {inside.map((page) => (
                  <li key={page.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/publication/question-types/${page.id}/questions`}
                      className="text-sm text-navy-950 hover:underline"
                    >
                      {page.title}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {page.itemCount} {page.itemCount === 1 ? 'activity' : 'activities'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      </ul>

      {/* One Save for the whole contents page. Remove stays per row, because
          removing one chapter is not part of saving the others. */}
      <div className="mt-4 flex items-center gap-3 border-t border-navy-950/[0.06] pt-4">
        <SubmitButton pendingLabel="Saving…" className="shrink-0 whitespace-nowrap">
          Save chapters
        </SubmitButton>
        <span className="text-xs text-slate-500">
          Names, films and pictures together. Moving a chapter — by dragging or the arrows —
          saves the order on its own.
        </span>
      </div>
    </form>
  );
}
