import Link from 'next/link';
import type { Metadata } from 'next';
import type { Paginated, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconChevronRight, IconPlus, IconSearch } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import { Toast } from '@/components/ui/toast';
import { FOCUS } from '../readiness';

export const metadata: Metadata = { title: 'Schools · Poetree Admin' };

/** The counts behind the status tabs: the same numbers the Overview shows. */
interface StatusCounts {
  schools: { total: number; active: number; trial: number; suspended: number; expired: number };
}

const STATUSES = [
  { value: '', label: 'All', count: (c: StatusCounts['schools']) => c.total },
  { value: 'ACTIVE', label: 'Active', count: (c: StatusCounts['schools']) => c.active },
  { value: 'TRIAL', label: 'Trial', count: (c: StatusCounts['schools']) => c.trial },
  { value: 'SUSPENDED', label: 'Suspended', count: (c: StatusCounts['schools']) => c.suspended },
  { value: 'EXPIRED', label: 'Expired', count: (c: StatusCounts['schools']) => c.expired },
] as const;

/** A school's list address with these filters — so paging never drops them. */
function listHref(filters: { search?: string; status?: string }): string {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  const text = query.toString();
  return text ? `/publication/schools?${text}` : '/publication/schools';
}

/** When access ends, with a word when that is soon or already past. */
function AccessEnds({ school }: { school: SchoolSummary }) {
  const remaining = daysUntil(school.validUntil ?? school.expiresAt);
  return (
    <>
      {school.validUntil ? (
        formatDate(school.validUntil)
      ) : (
        /* No end date is a real state, not a missing value: they stay on
           until somebody sets one. */
        <span className="text-slate-500">No end date</span>
      )}
      {remaining !== null && remaining <= 30 && remaining > 0 && (
        <span className="mt-0.5 block text-xs text-gold-700">
          {remaining} day{remaining === 1 ? '' : 's'} left
        </span>
      )}
      {remaining !== null && remaining <= 0 && (
        <span className="mt-0.5 block text-xs text-rose-600">Date passed</span>
      )}
    </>
  );
}

/**
 * Every school on Poetree: who has access, and until when.
 *
 * Status is a row of tabs with counts rather than a dropdown and an Apply
 * button, so how many schools are suspended is on screen before anybody asks.
 * On a phone each school is a card: the table there scrolled sideways and hid
 * everything after the School ID.
 */
export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; deleted?: string }>;
}) {
  const { page = '1', search, status, deleted } = await searchParams;
  const current = STATUSES.find((entry) => entry.value === (status ?? '')) ?? STATUSES[0];

  const [data, counts] = await Promise.all([
    apiFetch<Paginated<SchoolSummary>>('/publication/schools', {
      query: { page, pageSize: 20, search, status: current.value || undefined },
    }),
    apiFetch<StatusCounts>('/publication/overview'),
  ]);

  const filtered = Boolean(search || current.value);
  const basePath = listHref({ search, status: current.value });

  return (
    <>
      <PageHeader
        title="Schools"
        description="Every school on Poetree: who has access, and until when."
        action={
          <Link
            href="/publication/schools/new"
            className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
          >
            <IconPlus size={17} aria-hidden="true" />
            Add school
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter schools by status" className="flex flex-wrap gap-2">
          {STATUSES.map((entry) => {
            const active = entry.value === current.value;
            return (
              <Link
                key={entry.label}
                href={listHref({ search, status: entry.value })}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${FOCUS} ${
                  active
                    ? 'bg-navy-900 text-white'
                    : 'bg-white text-navy-900 ring-1 ring-inset ring-navy-950/10 hover:bg-navy-50'
                }`}
              >
                {entry.label}{' '}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {entry.count(counts.schools)}
                </span>
              </Link>
            );
          })}
        </nav>

        <form
          action="/publication/schools"
          role="search"
          className="flex w-full items-center gap-2 sm:w-auto"
        >
          {current.value && <input type="hidden" name="status" value={current.value} />}
          <label htmlFor="school-search" className="sr-only">
            Search schools
          </label>
          <div className="relative flex-1 sm:w-72">
            <IconSearch
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="school-search"
              name="search"
              type="search"
              defaultValue={search}
              placeholder="Name, School ID or city"
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3.5 text-base text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            className={`rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50 ${FOCUS}`}
          >
            Search
          </button>
          {filtered && (
            <Link
              href="/publication/schools"
              className="px-1 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? 'No schools match' : 'No schools yet'}
            description={
              filtered
                ? 'Try another status or a broader search, or clear the filters.'
                : "Add the first school to start onboarding Poetree's customers."
            }
            action={
              !filtered && (
                <Link
                  href="/publication/schools/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                >
                  <IconPlus size={17} aria-hidden="true" />
                  Add school
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Phones: one card per school, nothing cut off. */}
          <ul className="space-y-3 md:hidden" aria-label="Schools">
            {data.items.map((school) => (
              <li key={school.id}>
                <Link
                  href={`/publication/schools/${school.id}`}
                  className={`block rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy-950/[0.07] transition-colors hover:ring-navy-950/15 ${FOCUS}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium text-navy-950 [overflow-wrap:anywhere]">
                      {school.name}
                    </span>
                    <StatusBadge status={school.status} />
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    <code className="font-mono">{school.code}</code>
                    {school.city && <> · {school.city}</>}
                  </span>
                  <span className="mt-2 block text-xs text-slate-600">
                    Access ends: <AccessEnds school={school} />
                  </span>
                  <span className="mt-1 block text-xs tabular-nums text-slate-600">
                    {school.counts.students} {school.counts.students === 1 ? 'student' : 'students'}{' '}
                    · {school.counts.users} {school.counts.users === 1 ? 'user' : 'users'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="md:hidden">
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              basePath={basePath}
              noun={['school', 'schools']}
            />
          </div>

          {/* Laptops: the table. */}
          <div className="hidden md:block">
            <Card>
              <Table>
                <THead
                  columns={[
                    'School',
                    'School ID',
                    'Status',
                    'Access ends',
                    { label: 'Students', numeric: true },
                    { label: 'Users', numeric: true },
                    { label: 'Open', hidden: true },
                  ]}
                />
                <tbody>
                  {data.items.map((school) => (
                    <TRow key={school.id}>
                      <TCell>
                        <TPrimary sub={school.city ?? undefined}>
                          <Link
                            href={`/publication/schools/${school.id}`}
                            className={`rounded-sm hover:text-navy-700 hover:underline ${FOCUS}`}
                          >
                            {school.name}
                          </Link>
                        </TPrimary>
                      </TCell>
                      <TCell>
                        <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {school.code}
                        </code>
                      </TCell>
                      <TCell>
                        <StatusBadge status={school.status} />
                      </TCell>
                      <TCell>
                        <AccessEnds school={school} />
                      </TCell>
                      <TCell numeric>{school.counts.students}</TCell>
                      <TCell numeric>{school.counts.users}</TCell>
                      <TCell className="text-right">
                        <Link
                          href={`/publication/schools/${school.id}`}
                          className={`inline-flex items-center gap-1 rounded-md text-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
                        >
                          Manage
                          <IconChevronRight size={15} aria-hidden="true" />
                        </Link>
                      </TCell>
                    </TRow>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                basePath={basePath}
                noun={['school', 'schools']}
              />
            </Card>
          </div>
        </>
      )}
      {/* After a school is deleted: the name, shown only as text. */}
      {deleted && <Toast message={`${deleted.slice(0, 120)} is deleted, with everything in it.`} />}
    </>
  );
}
