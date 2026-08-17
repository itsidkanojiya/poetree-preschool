import Link from 'next/link';
import type { Metadata } from 'next';
import type { StandardSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconPlus } from '@/components/icons';
import { CatalogueTabs } from '../tabs';

export const metadata: Metadata = { title: 'Standards · Poetree Admin' };

/**
 * The years a preschool teaches.
 *
 * Four of these were compiled into the code until a school called its first
 * year something else. They are rows now, and they belong to the publisher
 * rather than to each school: a book and a child's progress both hang off a
 * standard, so sixty schools each inventing their own would make "Nursery"
 * mean sixty different things.
 *
 * A list, and only a list. Editing is on the standard's own page.
 */
export default async function StandardsPage() {
  const standards = await apiFetch<StandardSummary[]>('/publication/books/standards', {
    query: { includeInactive: 'true' },
  });

  return (
    <>
      <PageHeader
        title="Standards"
        description="The years a school teaches. Books, classes and progress all hang off these."
        action={
          <Link
            href="/publication/books/standards/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add standard
          </Link>
        }
      />

      <CatalogueTabs current="standards" />

      <Card>
        {standards.length === 0 ? (
          <EmptyState
            title="No standards yet"
            description="Add the first one — a school cannot open a class without one."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Standard',
                { label: 'Order', numeric: true },
                { label: 'Classes', numeric: true },
                'State',
              ]}
            />
            <tbody>
              {standards.map((standard) => (
                <TRow key={standard.id}>
                  <TCell>
                    <Link
                      href={`/publication/books/standards/${standard.id}`}
                      className="hover:underline"
                    >
                      <TPrimary sub={standard.code}>{standard.name}</TPrimary>
                    </Link>
                  </TCell>
                  {/* The order children meet these years in, which is the order
                      every list of standards in the product is drawn in. */}
                  <TCell numeric>{standard.sortOrder}</TCell>
                  {/* Across every school. It is what makes a standard
                      undeletable, so it is shown before anybody tries. */}
                  <TCell numeric>{standard.classroomCount}</TCell>
                  <TCell>
                    {standard.isActive ? (
                      <Pill tone="brand">In use</Pill>
                    ) : (
                      <Pill tone="neutral">Not offered</Pill>
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
