import Link from 'next/link';
import type { Paginated, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { PageHeader, StatusBadge, EmptyState } from '@/components/ui/layout';
import { Pagination, TCell, THead, TRow, Table } from '@/components/ui/table';
import { daysUntil, formatDate } from '@/lib/format';

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const { page = '1', search, status } = await searchParams;

  const data = await apiFetch<Paginated<SchoolSummary>>('/publication/schools', {
    query: { page, pageSize: 20, search, status },
  });

  return (
    <>
      <PageHeader
        title="Schools"
        description="Onboard schools, assign plans, and control access."
        action={
          <Link
            href="/publication/schools/new"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add school
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/publication/schools">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by name, code or city"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Filter
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {data.items.length === 0 ? (
          <EmptyState
            title="No schools yet"
            description="Add the first school to start onboarding Poetree’s customers."
          />
        ) : (
          <Table>
            <THead columns={['School', 'Code', 'Status', 'Plan', 'Expires', 'Students', '']} />
            <tbody>
              {data.items.map((school) => {
                const remaining = daysUntil(school.expiresAt);
                return (
                  <TRow key={school.id}>
                    <TCell className="font-medium text-slate-900">
                      {school.name}
                      {school.city && <span className="block text-xs text-slate-500">{school.city}</span>}
                    </TCell>
                    <TCell className="font-mono text-xs">{school.code}</TCell>
                    <TCell>
                      <StatusBadge status={school.status} />
                    </TCell>
                    <TCell>{school.planName ?? '—'}</TCell>
                    <TCell>
                      {formatDate(school.expiresAt)}
                      {remaining !== null && remaining <= 30 && remaining > 0 && (
                        <span className="block text-xs text-amber-600">in {remaining} day(s)</span>
                      )}
                    </TCell>
                    <TCell>{school.counts.students}</TCell>
                    <TCell>
                      <Link
                        href={`/publication/schools/${school.id}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        Manage
                      </Link>
                    </TCell>
                  </TRow>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        basePath="/publication/schools"
      />
    </>
  );
}
