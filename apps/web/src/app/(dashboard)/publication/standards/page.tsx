import type { Metadata } from 'next';
import type { StandardSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { NewStandardForm, RetireStandardButton, StandardRow } from './forms';

export const metadata: Metadata = { title: 'Standards · Poetree Admin' };

/**
 * The years a preschool teaches.
 *
 * Four of these were compiled into the code until a school called its first
 * year something else. They are rows now, and they belong to the publisher
 * rather than to each school: a book and a child's progress both hang off a
 * standard, so sixty schools each inventing their own would make "Nursery"
 * mean sixty different things.
 */
export default async function StandardsPage() {
  const standards = await apiFetch<StandardSummary[]>('/publication/standards', {
    query: { includeInactive: 'true' },
  });

  const months = (value: number | null) => (value === null ? null : `${value}m`);

  return (
    <>
      <PageHeader
        title="Standards"
        description="The years a school teaches. Books, classes and progress all hang off these."
      />

      <Card className="mb-6">
        {standards.length === 0 ? (
          <EmptyState
            title="No standards yet"
            description="Add the first one below — a school cannot open a class without one."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Standard',
                'Code',
                'Age',
                { label: 'Classes', numeric: true },
                'State',
                '',
              ]}
            />
            <tbody>
              {standards.map((standard) => (
                <TRow key={standard.id}>
                  <TCell>
                    <StandardRow standard={standard} />
                  </TCell>
                  <TCell>
                    <span className="font-mono text-xs text-slate-500">{standard.code}</span>
                  </TCell>
                  <TCell>
                    {months(standard.minAgeMonths) && months(standard.maxAgeMonths)
                      ? `${months(standard.minAgeMonths)}–${months(standard.maxAgeMonths)}`
                      : '—'}
                  </TCell>
                  {/* Across every school. It is what makes a standard
                      undeletable, so it is shown before anybody tries. */}
                  <TCell numeric>{standard.classroomCount}</TCell>
                  <TCell>
                    {standard.isActive ? (
                      <Pill tone="brand">Live</Pill>
                    ) : (
                      <Pill tone="neutral">Retired</Pill>
                    )}
                  </TCell>
                  <TCell>
                    <RetireStandardButton standard={standard} />
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="max-w-3xl">
        <Card title="Add a standard">
          <NewStandardForm />
        </Card>
      </div>
    </>
  );
}
