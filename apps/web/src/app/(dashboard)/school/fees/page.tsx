import type { AcademicYearSummary, Paginated, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill, StatTile } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { formatPrice } from '@/lib/format';
import { GenerateInvoicesForm, RecordPaymentForm } from './forms';

interface OutstandingRow {
  studentId: string;
  fullName: string;
  admissionNo: string;
  outstandingInPaise: number;
  overdueCount: number;
}

export default async function FeesPage() {
  const [outstanding, students, years] = await Promise.all([
    apiFetch<OutstandingRow[]>('/fees/outstanding'),
    apiFetch<Paginated<StudentSummary>>('/students', { query: { pageSize: 200 } }),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
  ]);

  const totalOutstanding = outstanding.reduce((sum, row) => sum + row.outstandingInPaise, 0);
  const withOverdue = outstanding.filter((row) => row.overdueCount > 0).length;

  return (
    <>
      <PageHeader
        title="Fees"
        description="Raise invoices, take payments, and see who still owes."
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
        <StatTile label="Children enrolled" value={students.total} />
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
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card
          title="Record a payment"
          description="Issues a numbered receipt and settles the oldest invoice first."
        >
          <RecordPaymentForm students={students.items} />
        </Card>

        <Card title="Generate invoices" description="Raises the bill for one period.">
          <GenerateInvoicesForm years={years} />
        </Card>
      </div>
    </>
  );
}
