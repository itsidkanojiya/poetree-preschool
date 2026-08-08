import type { Metadata } from 'next';
import { logoutAction } from '../login/actions';
import { SubmitButton } from '@/components/ui/form';

export const metadata: Metadata = { title: 'Access paused · Poetree Admin' };

/**
 * Where a school lands when its plan is switched off mid-session. The API has
 * already stopped answering for this school, so there is nothing to retry.
 */
export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Your school’s access is paused</h1>
        <p className="mt-3 text-sm text-slate-600">
          This school’s subscription is not currently active, so the portal is unavailable for
          everyone at the school.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Please contact Poetree Publication to restore access.
        </p>

        <form action={logoutAction} className="mt-6">
          <SubmitButton variant="secondary" className="w-full">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
