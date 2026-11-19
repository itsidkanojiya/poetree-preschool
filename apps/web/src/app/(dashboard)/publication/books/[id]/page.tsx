import Link from 'next/link';
import type { Metadata } from 'next';
import type {
  BookSubjectSummary,
  BookSummary,
  CatalogueActivity,
  ChapterSummary,
  Paginated,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft, IconPlus } from '@/components/icons';
import { Check, FOCUS, Readiness } from '../../readiness';
import { NewChapterForm } from './forms';
import { ChapterList } from './chapter-list';
import { BookCoverForm, BookDetailsForm, BookLiveSwitch } from '../forms';
import { DeleteButton } from '@/components/ui/delete-button';
import { deleteBookAction } from '../../delete-actions';

export const metadata: Metadata = { title: 'Book · Poetree Admin' };

/**
 * One book: where it stands, the chapters it is divided into, and its own
 * settings beside them.
 *
 * Standard → Book → Chapter → Question type → Questions. This is the middle of
 * that, and it is where an author works: a chapter is what a teacher and a
 * publisher both think in — "we're on chapter three". The readiness line at the
 * top answers the question the old page buried in a grey subtitle: can a school
 * that has this book actually use it?
 */
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [books, chapters, activities, subjects] = await Promise.all([
    apiFetch<BookSummary[]>('/publication/books'),
    apiFetch<ChapterSummary[]>(`/publication/books/${id}/chapters`),
    apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
      query: { bookId: id, pageSize: 100, includeInactive: 'true' },
    }),
    apiFetch<BookSubjectSummary[]>('/publication/book-subjects'),
  ]);

  const book = books.find((row) => row.id === id);
  if (!book) {
    return <EmptyState title="Book not found" description="It may have been removed." />;
  }

  // Pages filed in the book but not in any chapter. Not an error — a short book
  // may have no chapters at all — but worth being able to see.
  const unfiled = activities.items.filter((activity) => !activity.chapter);
  const empty = activities.total === 0;
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link
              href="/publication/books"
              className={`inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
            >
              <IconArrowLeft size={16} aria-hidden="true" />
              All books
            </Link>
            {!book.isActive && <Pill tone="neutral">Withdrawn</Pill>}
          </span>
        }
        title={book.name}
        description={`${book.classLevel.name}${book.subject ? ` · ${book.subject.name}` : ''} · ${book.code}`}
        action={
          <Link
            href={`/publication/questions/new?bookId=${book.id}`}
            className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
          >
            <IconPlus size={17} aria-hidden="true" />
            Add activity
          </Link>
        }
      />

      {/* Readiness: what a school that has this book will find in it. */}
      <Readiness label="Readiness" columns={5}>
        <Check
          label="On sale"
          value={book.isActive ? 'Yes' : 'Withdrawn'}
          state={book.isActive ? 'done' : 'info'}
        />
        <Check
          label="Activities"
          value={empty ? 'None yet' : plural(activities.total, 'type', 'types')}
          state={empty ? 'todo' : 'done'}
        />
        <Check
          label="Chapters"
          value={chapters.length === 0 ? 'None' : plural(chapters.length, 'chapter', 'chapters')}
          state="info"
        />
        <Check
          label="Cover"
          value={book.coverUrl ? 'Uploaded' : 'Not yet'}
          state={book.coverUrl ? 'done' : 'todo'}
        />
        <Check
          label="Schools using it"
          value={plural(book.schoolCount, 'school', 'schools')}
          state="info"
        />
      </Readiness>

      {book.isActive && empty && book.schoolCount > 0 && (
        <div className="mb-6">
          <Notice tone="danger" title="Schools have this book, and it is empty">
            {plural(book.schoolCount, 'school has', 'schools have')} it switched on and{' '}
            {book.schoolCount === 1 ? 'sees' : 'see'} an empty shelf. Add activities to a chapter
            below, or withdraw the book until it is ready.
          </Notice>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* Chapters first. This is the contents page — the thing an author
              works through, and the thing anybody opening the book wants. */}
          <Card
            title="Chapters"
            description="The contents page. A child opens the subject and then a chapter: its video, its activities and its PDF."
          >
            {chapters.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">
                None yet. A short book may not need any — its pages simply sit in the book itself.
              </p>
            ) : (
              <ChapterList
                bookId={id}
                chapters={chapters}
                pages={activities.items.map((activity) => ({
                  id: activity.id,
                  title: activity.title,
                  itemCount: activity.itemCount,
                  chapterId: activity.chapter?.id ?? null,
                }))}
              />
            )}

            {/* At the end of the list, which is where the next chapter appears. */}
            <div className="border-t border-navy-950/[0.06] pt-4">
              <NewChapterForm bookId={id} />
            </div>
          </Card>

          {unfiled.length > 0 && (
            <Card
              title="Not in a chapter"
              description="These are in the book but not filed under any chapter. Children still see them."
            >
              <ul className="divide-y divide-navy-950/[0.06]">
                {unfiled.map((page) => (
                  <li key={page.id}>
                    <Link
                      href={`/publication/question-types/${page.id}`}
                      className={`-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-navy-50 ${FOCUS}`}
                    >
                      <span className="text-sm text-navy-950">{page.title}</span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {plural(page.itemCount, 'activity', 'activities')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="The book" description="Its name, and what the app files it under.">
            <BookDetailsForm book={book} subjects={subjects} />
          </Card>
        </div>

        {/* Beside the chapters, not below them: whether it is on sale is the
            most consequential switch on the page, and it was the last thing on
            it. */}
        <aside className="space-y-6 xl:sticky xl:top-6">
          <Card title="Availability">
            <BookLiveSwitch book={book} />
          </Card>
          <Card
            title="Cover"
            description="What a child looks for on the shelf, long before they can read the name."
          >
            <BookCoverForm book={book} />
          </Card>
          {/* The one thing on the page that cannot be undone, last. */}
          <Card tone="danger" title="Delete this book">
            <p className="mb-3 text-sm text-slate-600">
              Erases the book, its chapters, the activity types only it holds and every child’s
              results on them, and takes it off every school. To stop selling it but keep it, switch
              it off above.
            </p>
            <DeleteButton
              action={deleteBookAction.bind(null, book.id)}
              label="Delete book permanently"
              title={`Delete ${book.name} permanently?`}
              body={
                <>
                  <p>
                    {book.name} is erased with its {chapters.length}{' '}
                    {chapters.length === 1 ? 'chapter' : 'chapters'} and the activity types filed only
                    in it, with every child’s results on them at every school.
                  </p>
                  <p>
                    {book.schoolCount} {book.schoolCount === 1 ? 'school loses' : 'schools lose'} it
                    from their app. Activity types shared with another book stay there.
                  </p>
                </>
              }
              confirmText={book.name}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-300 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
