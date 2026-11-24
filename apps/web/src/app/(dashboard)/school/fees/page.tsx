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
  const [outstanding, enrolled, proofs] = await Promise.all([
    apiFetch<OutstandingRow[]>('/fees/outstanding'),
    apiFetch<Paginated<StudentSummary>>('/students', { query: { pageSize: 1 } }),
    apiFetch<{ waiting: number }>('/fees/proofs/count'),
  ]);

  const totalOutstanding = outstanding.reduce((sum, row) => sum + row.outstandingInPaise, 0);
  const withOverdue = outstanding.filter((row) => row.overdueCount > 0).length;

  return (
    <>
      <PageHeader
        title="Fees"
        description="Take payments, see who still has to pay, and set up the year’s fees."
        action={
          <Link
            href="/school/fees/payment"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-raised transition-colors hover:bg-emerald-700"
          >
            <IconPlus size={17} />
            Record a payment
          </Link>
        }
      />

      {/* Everything else, in the two jobs it belongs to. */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <FeeLinks
          title="Set up"
          links={[
            { href: '/school/fees/structure', label: 'Fee structure', hint: 'What each standard pays' },
            { href: '/school/fees/payment-details', label: 'Payment details', hint: 'Your UPI and bank account' },
            { href: '/school/fees/invoices', label: 'Generate invoices', hint: 'Bill a month or term' },
          ]}
        />
        <FeeLinks
          title="Follow up"
          links={[
            {
              href: '/school/fees/to-approve',
              label: 'Payments to approve',
              hint: 'Screenshots parents sent',
              count: proofs.waiting,
            },
            { href: '/school/fees/follow-ups', label: 'Follow-ups', hint: 'Families to call' },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Outstanding"
          value={formatPrice(totalOutstanding)}
          tone={totalOutstanding > 0 ? 'warning' : 'good'}
          hint={
            outstanding.length === 1
              ? '1 child has fees to pay'
              : `${outstanding.length} children have fees to pay`
          }
        />
        <StatTile
          label="Past due date"
          value={withOverdue}
          tone={withOverdue > 0 ? 'critical' : 'good'}
          hint="Installments past their due date"
        />
        <StatTile label="Children enrolled" value={enrolled.total} tone="sky" />
      </div>

      <div className="mt-6">
        <Card
          title="Who still owes"
          description="Largest amount first. A payment pays the oldest bill first."
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

/** A labelled group of fee pages, each with a line saying what it is for. */
function FeeLinks({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string; hint: string; count?: number }>;
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-navy-950/[0.06]">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-emerald-700">
        {title}
      </h2>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-emerald-50"
            >
              <span>
                <span className="block font-semibold text-navy-950">{link.label}</span>
                <span className="block text-xs text-slate-500">{link.hint}</span>
              </span>
              {link.count ? (
                <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white">
                  {link.count} waiting
                </span>
              ) : (
                <span className="text-slate-300" aria-hidden="true">
                  ›
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
