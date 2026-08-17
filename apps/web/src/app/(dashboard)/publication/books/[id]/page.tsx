import Link from 'next/link';
import type { Metadata } from 'next';
import type { BookSummary, CatalogueActivity, ChapterSummary, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { ChapterRow, DeleteChapterButton, NewChapterForm } from './forms';
import { BookCoverForm, BookDetailsForm, BookLiveSwitch } from '../forms';

export const metadata: Metadata = { title: 'Book · Poetree Admin' };

/**
 * One book: everything true of it, and the chapters it is divided into.
 *
 * Standard → Book → Chapter → Question type → Questions. This is the middle of
 * that, and it is where an author works: a chapter is what a teacher and a
 * publisher both think in — "we're on chapter three".
 *
 * The book's own fields live here rather than in the list, so the list can be
 * read as a list.
 */
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [books, chapters, activities] = await Promise.all([
    apiFetch<BookSummary[]>('/publication/books'),
    apiFetch<ChapterSummary[]>(`/publication/books/${id}/chapters`),
    apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
      query: { bookId: id, pageSize: 100, includeInactive: 'true' },
    }),
  ]);

  const book = books.find((row) => row.id === id);
  if (!book) {
    return <EmptyState title="Book not found" description="It may have been removed." />;
  }

  // Pages filed in the book but not in any chapter. Not an error — a short book
  // may have no chapters at all — but worth being able to see.
  const unfiled = activities.items.filter((activity) => !activity.chapter);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link
              href="/publication/books"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
            >
              <IconArrowLeft size={16} />
              All books
            </Link>
            {!book.isActive && <Pill tone="neutral">Withdrawn</Pill>}
          </span>
        }
        title={book.name}
        description={`${book.classLevel.name} · ${activities.total} question ${
          activities.total === 1 ? 'type' : 'types'
        } · ${book.schoolCount} ${book.schoolCount === 1 ? 'school' : 'schools'}`}
      />

      <div className="mb-6 grid items-start gap-4 lg:grid-cols-2">
        <Card title="The book">
          <BookDetailsForm book={book} />
        </Card>

        <div className="space-y-4">
          <Card
            title="Cover"
            description="What a child looks for on the shelf, long before they can read the name."
          >
            <BookCoverForm book={book} />
          </Card>

          <Card title="Availability">
            <BookLiveSwitch book={book} />
          </Card>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Chapters
      </h2>

      <div className="mb-6 space-y-4">
        {chapters.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. A short book may not need any — its pages simply sit in the book itself.
          </p>
        ) : (
          chapters.map((chapter) => {
            const pages = activities.items.filter((activity) => activity.chapter?.id === chapter.id);

            return (
              <Card key={chapter.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <ChapterRow chapter={chapter} />
                  <span className="flex items-center gap-2">
                    {chapter.questionCount === 0 ? (
                      /* Named but not written: the state worth seeing at a
                         glance, because it looks finished from the outside. */
                      <Pill tone="neutral">Nothing written yet</Pill>
                    ) : (
                      <Pill tone="brand">
                        {chapter.questionCount}{' '}
                        {chapter.questionCount === 1 ? 'question' : 'questions'}
                      </Pill>
                    )}
                    <DeleteChapterButton chapter={chapter} />
                  </span>
                </div>

                {pages.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No pages in this chapter yet. Add a question type and choose this chapter.
                  </p>
                ) : (
                  <ul className="divide-y divide-navy-950/[0.06]">
                    {pages.map((page) => (
                      <li key={page.id} className="flex items-center justify-between gap-3 py-2">
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
              </Card>
            );
          })
        )}

        {unfiled.length > 0 && (
          <Card
            title="Not in a chapter"
            description="These are in the book but not filed under any chapter. Children still see them."
          >
            <ul className="divide-y divide-navy-950/[0.06]">
              {unfiled.map((page) => (
                <li key={page.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/publication/question-types/${page.id}`}
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
          </Card>
        )}
      </div>

      <div className="max-w-3xl">
        <Card title="Add a chapter">
          <NewChapterForm bookId={id} />
        </Card>
      </div>
    </>
  );
}
