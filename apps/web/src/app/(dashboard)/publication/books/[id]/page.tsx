import Link from 'next/link';
import type { Metadata } from 'next';
import type { BookSummary, CatalogueActivity, ChapterSummary, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { ChapterRow, DeleteChapterButton, NewChapterForm } from './forms';

export const metadata: Metadata = { title: 'Chapters · Poetree Admin' };

/**
 * One book, and the chapters it is divided into.
 *
 * Standard → Book → Chapter → Question type → Questions. This is the middle of
 * that, and it is where an author works: a chapter is what a teacher and a
 * publisher both think in — "we're on chapter three".
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
      <Link
        href="/publication/books"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900"
      >
        <IconArrowLeft size={16} /> All books
      </Link>

      <PageHeader
        title={book.name}
        description={`${book.classLevel.name} · ${activities.total} question ${
          activities.total === 1 ? 'type' : 'types'
        }`}
      />

      <div className="mb-6 space-y-4">
        {chapters.length === 0 ? (
          <Card>
            <EmptyState
              title="No chapters yet"
              description="Add the first one below, then file the book's pages into it."
            />
          </Card>
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
