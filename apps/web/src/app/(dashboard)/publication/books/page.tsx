import Link from 'next/link';
import type { Metadata } from 'next';
import type { BookSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { EmptyState, PageHeader } from '@/components/ui/layout';
import { IconAlert, IconCheck, IconPlus, IconSchool, IconSpark } from '@/components/icons';
import { CatalogueTabs } from './tabs';
import { SampleBookCard } from './sample-book';
import { Toast } from '@/components/ui/toast';

export const metadata: Metadata = { title: 'Books · Poetree Admin' };

/** One focus style for everything clickable, so keyboard users never lose their place. */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2';

/** On sale but with nothing in it: a school given it sees an empty shelf. */
const needsWork = (book: BookSummary) => book.isActive && book.activityCount === 0;

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'live', label: 'On sale', test: (book: BookSummary) => book.isActive },
  { key: 'work', label: 'Needs work', test: needsWork },
  { key: 'withdrawn', label: 'Withdrawn', test: (book: BookSummary) => !book.isActive },
] as const;

/** Soft tints for the stand-in cover, picked from the subject so a book keeps its colour. */
const TINTS = [
  'from-navy-100 to-navy-50 text-navy-800',
  'from-leaf-100 to-leaf-50 text-leaf-800',
  'from-gold-100 to-gold-50 text-gold-800',
  'from-rose-100 to-rose-50 text-rose-800',
  'from-sky-100 to-sky-50 text-sky-800',
];

function tintFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

/**
 * The cover, as the shelf in the app shows it — or, with none uploaded, a
 * stand-in in the book's own colour carrying its initials, so the catalogue
 * reads as books rather than a column of grey "no cover" boxes.
 */
function ShelfCover({ book }: { book: BookSummary }) {
  const fileId = book.coverUrl?.split('/').pop();
  if (fileId) {
    return (
      <img
        src={`/attachments?kind=catalogue&id=${fileId}`}
        alt=""
        className="h-32 w-24 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-navy-950/10"
      />
    );
  }
  const initials = book.name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return (
    <span
      className={`flex h-32 w-24 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-b ${tintFor(
        book.subject?.name ?? book.name,
      )} ring-1 ring-navy-950/10`}
      aria-hidden="true"
    >
      <span className="text-2xl font-semibold tracking-tight">{initials || 'B'}</span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-wider opacity-70">
        No cover
      </span>
    </span>
  );
}

/** Where the book stands, in words and an icon as well as a colour. */
function BookState({ book }: { book: BookSummary }) {
  if (!book.isActive) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
        Withdrawn
      </span>
    );
  }
  if (needsWork(book)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
          book.schoolCount > 0
            ? 'bg-rose-50 text-rose-800 ring-rose-200'
            : 'bg-gold-50 text-gold-900 ring-gold-200'
        }`}
      >
        <IconAlert size={13} strokeWidth={2} aria-hidden="true" />
        {book.schoolCount > 0 ? 'Sold, but empty' : 'No activities yet'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-2.5 py-1 text-xs font-medium text-leaf-800 ring-1 ring-inset ring-leaf-200">
      <IconCheck size={13} strokeWidth={2} aria-hidden="true" />
      On sale
    </span>
  );
}

/** One book on the shelf. The whole card opens it. */
function BookCard({ book }: { book: BookSummary }) {
  return (
    <Link
      href={`/publication/books/${book.id}`}
      className={`group flex gap-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy-950/[0.07] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:ring-navy-950/15 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS}`}
    >
      <ShelfCover book={book} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-navy-950 [overflow-wrap:anywhere] group-hover:text-navy-700">
          {book.name}
        </span>
        <span className="mt-0.5 text-xs text-slate-500">
          {book.classLevel.name}
          {book.subject && <> · {book.subject.name}</>}
        </span>
        <span className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={book.code}>
          {book.code}
        </span>

        <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <IconSpark size={14} className="text-slate-400" aria-hidden="true" />
            <span className="tabular-nums">{book.activityCount}</span>
            {book.activityCount === 1 ? 'activity type' : 'activity types'}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconSchool size={14} className="text-slate-400" aria-hidden="true" />
            <span className="tabular-nums">{book.schoolCount}</span>
            {book.schoolCount === 1 ? 'school' : 'schools'}
          </span>
        </span>
        <span className="mt-2.5">
          <BookState book={book} />
        </span>
      </span>
    </Link>
  );
}

/**
 * What Poetree sells, as a shelf.
 *
 * Grouped by standard, the way a school buys them, with each book's cover and
 * where it stands — on sale, withdrawn, or on sale with nothing in it. That
 * last one used to be a sentence above a table, naming books you then had to
 * find in it; now it is on the book, and one filter away.
 *
 * Adding one here does not give it to anybody: a new book is switched off at
 * every school until somebody sells it, which is done on the school's own page.
 */
export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; deleted?: string }>;
}) {
  const { show, deleted } = await searchParams;
  const books = await apiFetch<BookSummary[]>('/publication/books');

  const filter = FILTERS.find((entry) => entry.key === show) ?? FILTERS[0];
  const shown = books.filter(filter.test);

  // Standards in the order the API gives the books, which is the school year.
  const standards = [
    ...new Map(shown.map((book) => [book.classLevel.id, book.classLevel])).values(),
  ];
  const sampleId = books.find((book) => book.code === 'PRE_PRIMARY_A_SAMPLES')?.id;

  return (
    <>
      <PageHeader
        title="Books"
        description="Each one belongs to a standard and holds the activities children play."
        action={
          <Link
            href="/publication/books/new"
            className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
          >
            <IconPlus size={17} aria-hidden="true" />
            Add book
          </Link>
        }
      />

      <CatalogueTabs current="books" />

      {books.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy-950/[0.07]">
          <EmptyState
            title="No books yet"
            description="Add the first one, then turn it on for the schools that bought it."
          />
        </div>
      ) : (
        <>
          {/* Counts on every filter, so "Needs work" says how much before it is opened. */}
          <nav aria-label="Show books" className="mb-6 flex flex-wrap gap-2">
            {FILTERS.map((entry) => {
              const total = books.filter(entry.test).length;
              const active = entry.key === filter.key;
              return (
                <Link
                  key={entry.key}
                  href={
                    entry.key === 'all'
                      ? '/publication/books'
                      : `/publication/books?show=${entry.key}`
                  }
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${FOCUS} ${
                    active
                      ? 'bg-navy-900 text-white'
                      : 'bg-white text-navy-900 ring-1 ring-inset ring-navy-950/10 hover:bg-navy-50'
                  }`}
                >
                  {entry.key === 'work' && total > 0 && !active && (
                    <IconAlert size={14} className="text-gold-700" aria-hidden="true" />
                  )}
                  {entry.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {total}
                  </span>
                </Link>
              );
            })}
          </nav>

          {shown.length === 0 ? (
            <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy-950/[0.07]">
              <EmptyState
                title={
                  filter.key === 'work' ? 'Every book on sale has activities' : 'No books here'
                }
                description={
                  filter.key === 'work'
                    ? 'Nothing needs work — no school is looking at an empty shelf.'
                    : 'Try another filter.'
                }
              />
            </div>
          ) : (
            <div className="space-y-8">
              {standards.map((standard) => {
                const inStandard = shown.filter((book) => book.classLevel.id === standard.id);
                return (
                  <section key={standard.id} aria-labelledby={`standard-${standard.id}`}>
                    <h2
                      id={`standard-${standard.id}`}
                      className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-navy-950"
                    >
                      {standard.name}
                      <span className="text-xs font-normal text-slate-500">
                        {inStandard.length} {inStandard.length === 1 ? 'book' : 'books'}
                      </span>
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {inStandard.map((book) => (
                        <BookCard key={book.id} book={book} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* A tool for authors, not part of the catalogue: below it, not above. */}
      <div className="mt-10">
        <SampleBookCard bookId={sampleId} />
      </div>
      {deleted && <Toast message={`${deleted.slice(0, 120)} is deleted permanently.`} />}
    </>
  );
}
