import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrganisationSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { NewOrganisationForm } from './forms';

export const metadata: Metadata = { title: 'Groups · Poetree' };

/**
 * Customers that run more than one school.
 *
 * A branch is an ordinary school row underneath — this screen exists so the
 * publisher can see which schools belong together, and so a group can be given
 * one administrator across all of them.
 */
export default async function OrganisationsPage() {
  const organisations = await apiFetch<OrganisationSummary[]>('/publication/organisations');

  return (
    <>
      <PageHeader
        title="Groups"
        description="A school that runs several branches. Each branch is still its own school, with its own children, staff and fees."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Groups" description="Branches are added from the Schools screen.">
          {organisations.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Most schools are independent. Create a group only when one owner runs several branches."
            />
          ) : (
            <ul className="divide-y divide-navy-950/5">
              {organisations.map((organisation) => (
                <li key={organisation.id}>
                  <Link
                    href={`/publication/organisations/${organisation.id}`}
                    className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-navy-900"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-navy-950">
                        {organisation.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-slate-500">
                        {organisation.code}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-slate-500">
                      {organisation.branchCount}{' '}
                      {organisation.branchCount === 1 ? 'branch' : 'branches'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="New group" description="The branches come afterwards, one school at a time.">
          <NewOrganisationForm />
        </Card>
      </div>
    </>
  );
}
