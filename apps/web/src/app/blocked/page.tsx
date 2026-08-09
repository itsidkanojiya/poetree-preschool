import type { Metadata } from 'next';
import Image from 'next/image';
import { logoutAction } from '../login/actions';
import { SubmitButton } from '@/components/ui/form';
import { IconBan } from '@/components/icons';

export const metadata: Metadata = { title: 'Access paused · Poetree Admin' };

/**
 * Where a school lands when its plan is switched off mid-session. The API has
 * already stopped answering for this school, so there is deliberately no retry
 * button — only a way out.
 */
export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-raised ring-1 ring-navy-950/[0.07]">
        <Image
          src="/poetree.png"
          alt="Poetree Publications"
          width={56}
          height={56}
          className="mx-auto h-14 w-14 object-contain"
        />

        <span className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200">
          <IconBan size={24} />
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-navy-950">
          Your school&rsquo;s access is paused
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          This school&rsquo;s subscription is not currently active, so the portal is unavailable for
          everyone at the school.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Please contact Poetree Publication to restore access.
        </p>

        <form action={logoutAction} className="mt-7">
          <SubmitButton variant="secondary" className="w-full">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
