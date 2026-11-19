import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrganisationOverview } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, StatusBadge } from '@/components/ui/layout';
import { IconArrowLeft, IconChevronRight, IconPlus } from '@/components/icons';
import { OrganisationAdminForm } from '../forms';
import { Check, FOCUS, Readiness } from '../../readiness';

export const metadata: Metadata = { title: 'Group · Poetree Admin' };

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`;

/**
 * One group: its branches, and the account that reaches all of them.
 *
 * Each branch opens its own school, and "Add a branch" opens Add a school with
 * this group already chosen — before, the page said to go to the Schools
 * screen and offered no way there.
 */
export default async function OrganisationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisation, branches, totals } = await apiFetch<OrganisationOverview>(
    `/publication/organisations/${id}/overview`,
  );
  const addBranch = `/publication/schools/new?group=${organisation.id}`;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/publication/organisations"
            className={`mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            All groups
          </Link>
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-navy-950 [overflow-wrap:anywhere]">
            {organisation.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Group code{' '}
            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              {organisation.code}
            </code>{' '}
            · branches are numbered under it
          </p>
        </div>
        <Link
          href={addBranch}
          className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
        >
          <IconPlus size={17} aria-hidden="true" />
          Add a branch
        </Link>
      </div>

      <Readiness label="Group" columns={3}>
        <Check
          label="Branches"
          value={branches.length === 0 ? 'None yet' : plural(branches.length, 'branch', 'branches')}
          state={branches.length === 0 ? 'todo' : 'info'}
        />
        <Check label="Students" value={totals.students.toLocaleString('en-IN')} state="info" />
        <Check label="Teachers" value={totals.teachers.toLocaleString('en-IN')} state="info" />
      </Readiness>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title="Branches"
          description="Each one is a school of its own. Open one to manage it."
        >
          {branches.length === 0 ? (
            <EmptyState
              title="No branches yet"
              description="Add the first one. Its School ID is numbered under the group code."
              action={
                <Link
                  href={addBranch}
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                >
                  <IconPlus size={17} aria-hidden="true" />
                  Add a branch
                </Link>
              }
            />
          ) : (
            <ul className="-mx-2 divide-y divide-navy-950/5">
              {branches.map((branch) => (
                <li key={branch.id}>
                  <Link
                    href={`/publication/schools/${branch.id}`}
                    className={`flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-navy-50 ${FOCUS}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-navy-950 [overflow-wrap:anywhere]">
                        {branch.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        <code className="font-mono">{branch.code}</code>
                        {branch.city && <> · {branch.city}</>} ·{' '}
                        {plural(branch.counts.students, 'student', 'students')} ·{' '}
                        {plural(branch.counts.teachers, 'teacher', 'teachers')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={branch.status} />
                      <IconChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Group administrator"
          description="Reaches every branch, one at a time, by choosing which to work in."
        >
          <OrganisationAdminForm organisationId={organisation.id} />
        </Card>
      </div>
    </>
  );
}
