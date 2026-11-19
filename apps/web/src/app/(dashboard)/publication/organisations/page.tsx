import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrganisationSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { IconChevronRight } from '@/components/icons';
import { NewOrganisationForm } from './forms';
import { DeleteButton } from '@/components/ui/delete-button';
import { deleteOrganisationAction } from '../delete-actions';
import { FOCUS } from '../readiness';

export const metadata: Metadata = { title: 'Groups · Poetree Admin' };

/**
 * Customers that run more than one school.
 *
 * A branch is an ordinary school row underneath — this screen exists so the
 * publisher can see which schools belong together, and so a group can be given
 * one administrator across all of them. Branches are added from the group's
 * own page.
 */
export default async function OrganisationsPage() {
  const organisations = await apiFetch<OrganisationSummary[]>('/publication/organisations');

  return (
    <>
      <PageHeader
        title="Groups"
        description="Owners who run several branches. Each branch is still a school of its own, with its own children, staff and fees."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Groups" description="Open a group to see its branches and add one.">
          {organisations.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Most schools are independent. Create a group only when one owner runs several branches."
            />
          ) : (
            <ul className="-mx-2 divide-y divide-navy-950/5">
              {organisations.map((organisation) => (
                <li key={organisation.id} className="flex items-center gap-2">
                  <Link
                    href={`/publication/organisations/${organisation.id}`}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-navy-50 ${FOCUS}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-navy-950 [overflow-wrap:anywhere]">
                        {organisation.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Group code <code className="font-mono">{organisation.code}</code>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-slate-600">
                      {organisation.branchCount}{' '}
                      {organisation.branchCount === 1 ? 'branch' : 'branches'}
                      <IconChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                    </span>
                  </Link>
                  <DeleteButton
                    action={deleteOrganisationAction.bind(null, organisation.id)}
                    title={`Delete the group ${organisation.name}?`}
                    body={
                      <>
                        <p>The group is erased, with its administrators’ accounts.</p>
                        <p>
                          Its {organisation.branchCount}{' '}
                          {organisation.branchCount === 1 ? 'branch carries' : 'branches carry'} on
                          as independent {organisation.branchCount === 1 ? 'school' : 'schools'} —
                          nothing in them is touched.
                        </p>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="New group" description="Then add its branches from the group's page.">
          <NewOrganisationForm />
        </Card>
      </div>
    </>
  );
}
