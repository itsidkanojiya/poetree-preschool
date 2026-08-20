'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { ChapterSummary } from '@poetree/shared';
import { Pill } from '@/components/ui/layout';
import { IconGrip } from '@/components/icons';
import { reorderChaptersAction, saveChaptersAction, type ChapterState } from './actions';
import { ChapterFields, DeleteChapterButton } from './forms';
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

  return (
    <form action={formAction}>
      <Toast message={state.success} />
      <Toast message={state.error} tone="bad" />

      <ul className={pending ? 'opacity-60' : ''}>
      {order.map((chapter) => {
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
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="cursor-grab text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                aria-hidden
              >
                <IconGrip size={16} />
              </span>

              <ChapterFields chapter={chapter} />

              <span className="ml-auto flex items-center gap-2">
                {chapter.questionCount === 0 ? (
                  /* Named but not written: the state worth seeing at a glance,
                     because it looks finished from the outside. */
                  <Pill tone="neutral">Nothing written yet</Pill>
                ) : (
                  <Pill tone="brand">
                    {chapter.questionCount} {chapter.questionCount === 1 ? 'question' : 'questions'}
                  </Pill>
                )}
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
                      {page.itemCount} {page.itemCount === 1 ? 'question' : 'questions'}
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
        <SubmitButton pendingLabel="Saving…">Save chapters</SubmitButton>
        <span className="text-xs text-slate-500">
          Names, numbers and films together. Dragging saves on its own.
        </span>
      </div>
    </form>
  );
}
