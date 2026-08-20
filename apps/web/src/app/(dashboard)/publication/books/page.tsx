import Link from 'next/link';
import type { Metadata } from 'next';
import type { BookSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { IconPlus } from '@/components/icons';
import { BookCover } from './forms';
import { CatalogueTabs } from './tabs';

export const metadata: Metadata = { title: 'Books · Poetree Admin' };

/**
 * What Poetree sells.
 *
 * A list and nothing else. Every field used to be editable in place, which put
 * four forms in every row and made the shelf itself hard to read — the one
 * question this screen should answer at a glance is "what do we publish", and
 * it was the hardest thing to see. Editing happens on the book's own page.
 *
 * Adding one here does not give it to anybody: a new book is switched off at
 * every school until somebody sells it, which is done on the school's own page.
 */
export default async function BooksPage() {
  const books = await apiFetch<BookSummary[]>('/publication/books');

  const empty = books.filter((book) => book.isActive && book.activityCount === 0);

  return (
    <>
      <PageHeader
        title="Books"
        description="Each one belongs to a standard and holds the questions children play."
        action={
          <Link
            href="/publication/books/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add book
          </Link>
        }
      />

      <CatalogueTabs current="books" />

      {empty.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {empty.length === 1 ? 'One book has' : `${empty.length} books have`} nothing in{' '}
          {empty.length === 1 ? 'it' : 'them'} yet: {empty.map((book) => book.name).join(', ')}. A
          school given an empty book sees an empty shelf.
        </div>
      )}

      <Card>
        {books.length === 0 ? (
          <EmptyState
            title="No books yet"
            description="Add the first one, then turn it on for the schools that bought it."
          />
        ) : (
          <Table>
            <THead
              columns={[
                '',
                'Book',
                'Standard',
                { label: 'Question types', numeric: true },
                { label: 'Schools', numeric: true },
                'State',
              ]}
            />
            <tbody>
              {books.map((book) => (
                <TRow key={book.id}>
                  <TCell>
                    <Link href={`/publication/books/${book.id}`} aria-label={`Open ${book.name}`}>
                      <BookCover book={book} />
                    </Link>
                  </TCell>
                  <TCell>
                    <Link
                      href={`/publication/books/${book.id}`}
                      className="font-medium text-navy-950 hover:underline"
                    >
                      {book.name}
                    </Link>
                    <span className="mt-0.5 block font-mono text-xs text-slate-400">
                      {book.code}
                    </span>
                  </TCell>
                  <TCell>{book.classLevel.name}</TCell>
                  <TCell numeric>{book.activityCount}</TCell>
                  {/* Schools with it switched on — what was actually sold. */}
                  <TCell numeric>{book.schoolCount}</TCell>
                  <TCell>
                    {book.isActive ? (
                      <Pill tone="brand">Live</Pill>
                    ) : (
                      <Pill tone="neutral">Withdrawn</Pill>
                    )}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
