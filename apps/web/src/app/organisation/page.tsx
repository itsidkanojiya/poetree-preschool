import type { Metadata } from 'next';
import type { AuthenticatedUser, BranchSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { SubmitButton } from '@/components/ui/form';
import { logoutAction } from '../login/actions';
import { BranchList } from './branches';

export const metadata: Metadata = { title: 'Choose a branch · Poetree' };

/**
 * Where a group administrator lands.
 *
 * Deliberately outside the dashboard: until a branch is chosen there is no
 * school, and every screen in there is a school's. This page and the sign-in
 * screen are the only two the portal shows without one.
 */
export default async function OrganisationPage() {
  const [{ user }, branches] = await Promise.all([
    apiFetch<{ user: AuthenticatedUser }>('/auth/me'),
    apiFetch<BranchSummary[]>('/auth/branches'),
  ]);

  const totals = branches.reduce(
    (sum, branch) => ({
      students: sum.students + branch.counts.students,
      teachers: sum.teachers + branch.counts.teachers,
    }),
    { students: 0, teachers: 0 },
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {user.organisation?.name ?? 'Your group'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-950">
          Which branch are you working in?
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {branches.length} branches · {totals.students} children · {totals.teachers} teachers.
          Everything after this belongs to the branch you pick; come back here to change it.
        </p>
      </header>

      <BranchList branches={branches} />

      <div className="mt-8 flex items-center justify-between gap-4 text-sm text-slate-500">
        <span>Signed in as {user.name}</span>
        <form action={logoutAction}>
          <SubmitButton variant="ghost">Sign out</SubmitButton>
        </form>
      </div>
    </main>
  );
}
