import type { Paginated, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill, StatTile } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { formatPrice } from '@/lib/format';
import Link from 'next/link';
import { IconPlus } from '@/components/icons';

interface OutstandingRow {
  studentId: string;
  fullName: string;
  admissionNo: string;
  outstandingInPaise: number;
  overdueCount: number;
}

export default async function FeesPage() {
  // Only the count is wanted here. Paging through every child to get it was
  // the price of having the payment picker on this screen, and the picker has
  // moved to its own page — so ask for one row and read the total.
  const [outstanding, enrolled] = await Promise.all([
    apiFetch<OutstandingRow[]>('/fees/outstanding'),
    apiFetch<Paginated<StudentSummary>>('/students', { query: { pageSize: 1 } }),
  ]);

  const totalOutstanding = outstanding.reduce((sum, row) => sum + row.outstandingInPaise, 0);
  const withOverdue = outstanding.filter((row) => row.overdueCount > 0).length;

  return (
    <>
      <PageHeader
        title="Fees"
        description="Raise invoices, take payments, and see who still owes."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/school/fees/invoices" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50">
              Generate invoices
            </Link>
            <Link href="/school/fees/payment" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
              <IconPlus size={17} />
              Record a payment
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Outstanding"
          value={formatPrice(totalOutstanding)}
          tone={totalOutstanding > 0 ? 'warning' : 'good'}
          hint={`${outstanding.length} child(ren) with a balance`}
        />
        <StatTile
          label="Past due date"
          value={withOverdue}
          tone={withOverdue > 0 ? 'critical' : 'good'}
          hint="Overdue is derived from the due date, never stored"
        />
        <StatTile label="Children enrolled" value={enrolled.total} />
      </div>

      <div className="mt-6">
        <Card
          title="Who still owes"
          description="Largest balance first. A payment settles the oldest invoice before the newest."
        >
          {outstanding.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="Every issued invoice has been paid in full."
            />
          ) : (
            <Table>
              <THead
                columns={[
                  'Child',
                  'Admission no.',
                  { label: 'Outstanding', numeric: true },
                  { label: 'Overdue invoices', numeric: true },
                  { label: 'Fee card', hidden: true },
                ]}
              />
              <tbody>
                {outstanding.map((row) => (
                  <TRow key={row.studentId}>
                    <TCell>
                      <TPrimary>{row.fullName}</TPrimary>
                    </TCell>
                    <TCell>
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {row.admissionNo}
                      </code>
                    </TCell>
                    <TCell numeric className="font-medium text-navy-950">
                      {formatPrice(row.outstandingInPaise)}
                    </TCell>
                    <TCell numeric>
                      {row.overdueCount > 0 ? (
                        <Pill tone="gold">{row.overdueCount} overdue</Pill>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TCell>
                    <TCell>
                      {/* Opens rather than downloads: an office looks at a fee
                          card before deciding to print it. */}
                      <a
                        href={`/school/documents?kind=fee-card&id=${row.studentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-navy-900 hover:text-navy-700"
                      >
                        Fee card
                      </a>
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

    </>
  );
}
