import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrganisationOverview } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill, StatusBadge } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { OrganisationAdminForm } from '../forms';

export const metadata: Metadata = { title: 'Group · Poetree' };

export default async function OrganisationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisation, branches, totals } = await apiFetch<OrganisationOverview>(
    `/publication/organisations/${id}/overview`,
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/organisations"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All groups
          </Link>
        }
        title={organisation.name}
        description={`${branches.length} branches · ${totals.students} children · ${totals.teachers} teachers`}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Branches"
          description="Each one is a school of its own. Add another from the Schools screen, choosing this group."
        >
          {branches.length === 0 ? (
            <EmptyState
              title="No branches yet"
              description="Add a school and pick this group, and its code will be numbered under the group's."
            />
          ) : (
            <ul className="divide-y divide-navy-950/5">
              {branches.map((branch) => (
                <li key={branch.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-navy-950">{branch.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      <code className="font-mono">{branch.code}</code>
                      {branch.city && <> · {branch.city}</>} · {branch.counts.students} children ·{' '}
                      {branch.counts.teachers} teachers
                    </span>
                  </span>
                  <StatusBadge status={branch.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Group code" description="What the group's own app is built with.">
            <Pill>{organisation.code}</Pill>
            <p className="mt-3 text-xs text-slate-500">
              Permanent. Branch codes are numbered under it, so one group ships one app rather
              than one per branch.
            </p>
          </Card>

          <Card
            title="Group administrator"
            description="Reaches every branch — one at a time, by choosing which to work in."
          >
            <OrganisationAdminForm organisationId={organisation.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
