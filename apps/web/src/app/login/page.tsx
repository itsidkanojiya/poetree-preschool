import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · Poetree Admin' };

const NOTICES: Record<string, string> = {
  expired: 'Your session has expired. Please sign in again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-600">Poetree</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Admin Portal</h1>
          <p className="mt-2 text-sm text-slate-600">
            For Poetree Publication and school administrators.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm notice={reason ? NOTICES[reason] : undefined} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Teacher and parent sign-in arrives with the school app in Phase 2.
        </p>
      </div>
    </main>
  );
}
