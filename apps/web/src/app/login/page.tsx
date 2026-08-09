import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · Poetree Admin' };

const NOTICES: Record<string, string> = {
  expired: 'Your session has expired. Please sign in again.',
  'password-changed': 'Password changed. Sign in with your new password.',
};

const HIGHLIGHTS = [
  'Onboard and manage every school from one place',
  'Teachers, parents and students, scoped to your school',
  'Plans and access controlled by Poetree Publication',
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel. Hidden on small screens so the form leads on mobile. */}
      <section className="relative hidden overflow-hidden bg-navy-950 px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 h-[26rem] w-[26rem] rounded-full bg-navy-800/60 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-[22rem] w-[22rem] rounded-full bg-gold-400/10 blur-2xl"
        />

        <div className="relative">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-pop">
            <Image
              src="/poetree.png"
              alt="Poetree Publications"
              width={48}
              height={48}
              className="h-11 w-11 object-contain"
              priority
            />
            <span>
              <span className="block text-sm font-semibold leading-tight text-navy-950">
                Poetree Publications
              </span>
              <span className="block text-xs leading-tight text-slate-500">
                School Management Platform
              </span>
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-snug tracking-tight text-white">
            Learning, organised.
          </h2>
          <p className="mt-3 text-navy-200">
            The administration side of Poetree&rsquo;s preschool platform — for Play Group, Nursery,
            Junior KG and Senior KG.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-navy-100">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-navy-300">
          © {new Date().getFullYear()} Poetree Publications
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Image
              src="/poetree.png"
              alt="Poetree Publications"
              width={72}
              height={72}
              className="h-16 w-16 object-contain"
              priority
            />
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-950">Welcome back</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Sign in to the Poetree administration portal.
            </p>
          </div>

          <LoginForm notice={reason ? NOTICES[reason] : undefined} />

          <p className="mt-8 rounded-xl bg-navy-50 px-4 py-3 text-center text-xs leading-relaxed text-navy-700">
            Teacher and parent sign-in arrives with the school app in Phase&nbsp;2.
          </p>
        </div>
      </section>
    </main>
  );
}
