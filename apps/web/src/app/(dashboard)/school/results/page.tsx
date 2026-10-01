import Link from 'next/link';
import type { ResultsClassroomRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { loadTerms, pickTerm, termTitle } from '@/lib/results';
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/layout';
import { Table, TCell, THead, TPrimary, TRow } from '@/components/ui/table';
import { ResultsTabs } from './tabs';

const PICKER =
  'rounded-xl border-0 bg-white py-2.5 pl-3.5 pr-9 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600';

/**
 * Where every class has got to with this term's report cards, so the office
 * can see who has handed over and publish what is ready.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const { term: termId } = await searchParams;
  const { terms, problem } = await loadTerms();
  const term = pickTerm(terms, termId);

  if (!term) {
    return (
      <>
        <PageHeader
          title="Results"
          description="Term report cards: class teachers fill them in, you check and send them to families."
        />
        <ResultsTabs current="classes" />
        <EmptyState
          title={problem ? 'No academic year yet' : 'No terms yet'}
          description={
            problem ??
            'Set up the grading scale, this year’s terms and what each class is graded on first.'
          }
          action={
            problem ? undefined : (
              <Link
                href="/school/results/setup"
                className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
              >
                Go to setup
              </Link>
            )
          }
        />
      </>
    );
  }

  const rows = await apiFetch<ResultsClassroomRow[]>(`/results/terms/${term.id}/overview`);
  const sum = (key: 'notStarted' | 'draft' | 'submitted' | 'published') =>
    rows.reduce((total, row) => total + row[key], 0);
  const children = rows.reduce((total, row) => total + row.children, 0);

  return (
    <>
      <PageHeader
        title="Results"
        description="Term report cards: class teachers fill them in, you check and send them to families."
        action={
          <form action="/school/results" className="flex items-center gap-2">
            <label htmlFor="term" className="sr-only">
              Term
            </label>
            <select id="term" name="term" defaultValue={term.id} className={PICKER}>
              {terms
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {termTitle(t)}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
            >
              Show
            </button>
          </form>
        }
      />
      <ResultsTabs current="classes" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Children" value={children} />
        <StatTile
          label="Being filled in"
          value={sum('draft')}
          hint={`${sum('notStarted')} not started`}
        />
        <StatTile
          label="Waiting for you"
          value={sum('submitted')}
          tone={sum('submitted') ? 'warning' : 'default'}
        />
        <StatTile label="Sent to families" value={sum('published')} tone="good" />
      </div>

      <Card title={termTitle(term)}>
        {rows.length === 0 ? (
          <EmptyState title="No classes this year" />
        ) : (
          <Table>
            <THead
              columns={[
                'Class',
                { label: 'Children', numeric: true },
                { label: 'Not started', numeric: true },
                { label: 'Draft', numeric: true },
                { label: 'With you', numeric: true },
                { label: 'Published', numeric: true },
                { label: 'Open', hidden: true },
              ]}
            />
            <tbody>
              {rows.map((row) => (
                <TRow key={row.classroomId}>
                  <TCell>
                    <TPrimary>{row.label}</TPrimary>
                  </TCell>
                  <TCell numeric>{row.children}</TCell>
                  <TCell numeric>{row.notStarted}</TCell>
                  <TCell numeric>{row.draft}</TCell>
                  <TCell numeric className={row.submitted ? 'font-semibold text-gold-800' : ''}>
                    {row.submitted}
                  </TCell>
                  <TCell numeric className={row.published ? 'text-leaf-800' : ''}>
                    {row.published}
                  </TCell>
                  <TCell numeric>
                    <Link
                      href={`/school/results/${row.classroomId}?term=${term.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
                    >
                      Open
                    </Link>
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
