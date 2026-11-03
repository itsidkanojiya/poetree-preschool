import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { POLICY_OWNER } from './policy-owner';

/**
 * The pages anyone may read without signing in: the Poetree Kids privacy
 * policy and the way to close an account. The app links to both, and so does
 * its Play Store listing — see PUBLIC_PATHS in middleware.ts.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <Link href="/privacy" className="flex items-center gap-3">
            <Image
              src="/poetree.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              priority
            />
            <span>
              <span className="block text-sm font-semibold leading-tight text-navy-950">
                Poetree Kids
              </span>
              <span className="block text-xs leading-tight text-slate-500">
                by {POLICY_OWNER.name}
              </span>
            </span>
          </Link>
          <nav className="flex gap-5 text-sm font-medium sm:ml-auto">
            <Link href="/privacy" className="text-navy-700 hover:text-navy-950">
              Privacy policy
            </Link>
            <Link href="/delete-account" className="text-navy-700 hover:text-navy-950">
              Delete account
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">{children}</main>

      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs text-slate-500">
        © {new Date().getFullYear()} {POLICY_OWNER.name}
      </footer>
    </div>
  );
}
