import type { Metadata } from 'next';
import type { BookSummary, StandardSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { BookNameForm, NewBookForm, RetireBookButton } from './forms';

export const metadata: Metadata = { title: 'Books · Poetree Admin' };

/**
 * What Poetree sells.
 *
 * A book belongs to one standard and holds the question types a child plays.
 * Adding one here does not give it to anybody — a new book is switched off at
 * every school until somebody sells it, which is done on the school's own page.
 */
export default async function BooksPage() {
  const [books, standards] = await Promise.all([
    apiFetch<BookSummary[]>('/publication/books'),
    apiFetch<StandardSummary[]>('/publication/standards'),
  ]);

  const empty = books.filter((book) => book.isActive && book.activityCount === 0);

  return (
    <>
      <PageHeader
        title="Books"
        description="Each one belongs to a standard and holds the questions children play."
      />

      {empty.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {empty.length === 1 ? 'One book has' : `${empty.length} books have`} nothing in{' '}
          {empty.length === 1 ? 'it' : 'them'} yet: {empty.map((book) => book.name).join(', ')}. A
          school given an empty book sees an empty shelf.
        </div>
      )}

      <Card className="mb-6">
        {books.length === 0 ? (
          <EmptyState
            title="No books yet"
            description="Add the first one below, then turn it on for the schools that bought it."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Book',
                'Standard',
                'Code',
                { label: 'Question types', numeric: true },
                { label: 'Schools', numeric: true },
                'State',
                '',
              ]}
            />
            <tbody>
              {books.map((book) => (
                <TRow key={book.id}>
                  <TCell>
                    <BookNameForm book={book} />
                  </TCell>
                  <TCell>{book.classLevel.name}</TCell>
                  <TCell>
                    <span className="font-mono text-xs text-slate-500">{book.code}</span>
                  </TCell>
                  <TCell numeric>{book.activityCount}</TCell>
                  {/* Schools with it switched on — what was actually sold. */}
                  <TCell numeric>{book.schoolCount}</TCell>
                  <TCell>
                    {book.isActive ? (
                      <Pill tone="brand">Live</Pill>
                    ) : (
                      <Pill tone="neutral">Retired</Pill>
                    )}
                  </TCell>
                  <TCell>
                    <RetireBookButton book={book} />
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="max-w-3xl">
        <Card title="Add a book">
          <NewBookForm standards={standards} />
        </Card>
      </div>
    </>
  );
}
