import Link from 'next/link';
import type { Paginated, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconPlus, IconSearch } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const { page = '1', search, status } = await searchParams;

  const data = await apiFetch<Paginated<SchoolSummary>>('/publication/schools', {
    query: { page, pageSize: 20, search, status },
  });

  const filtered = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Schools"
        description="Onboard schools, assign plans, and control access."
        action={
          <Link
            href="/publication/schools/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add school
          </Link>
        }
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/publication/schools">
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor="school-search"
              className="mb-1.5 block text-sm font-medium text-navy-950"
            >
              Search
            </label>
            <div className="relative">
              <IconSearch
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="school-search"
                name="search"
                defaultValue={search}
                placeholder="Name, code or city"
                className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600"
              />
            </div>
          </div>

          <div className="w-44">
            <label
              htmlFor="school-status"
              className="mb-1.5 block text-sm font-medium text-navy-950"
            >
              Status
            </label>
            <select
              id="school-status"
              name="status"
              defaultValue={status ?? ''}
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-3.5 pr-9 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
          >
            Apply
          </button>

          {filtered && (
            <Link
              href="/publication/schools"
              className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Card>
        {data.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No schools match those filters' : 'No schools yet'}
            description={
              filtered
                ? 'Try a broader search, or clear the filters.'
                : "Add the first school to start onboarding Poetree's customers."
            }
            action={
              !filtered && (
                <Link
                  href="/publication/schools/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                >
                  <IconPlus size={17} />
                  Add school
                </Link>
              )
            }
          />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'School',
                  'Code',
                  'Status',
                  'Plan',
                  'Expires',
                  { label: 'Students', numeric: true },
                  { label: 'Users', numeric: true },
                  { label: 'Manage', hidden: true },
                ]}
              />
              <tbody>
                {data.items.map((school) => {
                  const remaining = daysUntil(school.expiresAt);
                  return (
                    <TRow key={school.id}>
                      <TCell>
                        <TPrimary sub={school.city ?? undefined}>{school.name}</TPrimary>
                      </TCell>
                      <TCell>
                        <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {school.code}
                        </code>
                      </TCell>
                      <TCell>
                        <StatusBadge status={school.status} />
                      </TCell>
                      <TCell>{school.planName ?? '—'}</TCell>
                      <TCell>
                        {formatDate(school.expiresAt)}
                        {remaining !== null && remaining <= 30 && remaining > 0 && (
                          <span className="mt-0.5 block text-xs text-gold-700">
                            in {remaining} day{remaining === 1 ? '' : 's'}
                          </span>
                        )}
                      </TCell>
                      <TCell numeric>{school.counts.students}</TCell>
                      <TCell numeric>{school.counts.users}</TCell>
                      <TCell className="text-right">
                        <Link
                          href={`/publication/schools/${school.id}`}
                          className="text-sm font-medium text-navy-700 hover:underline"
                        >
                          Manage
                        </Link>
                      </TCell>
                    </TRow>
                  );
                })}
              </tbody>
            </Table>

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              basePath="/publication/schools"
            />
          </>
        )}
      </Card>
    </>
  );
}
