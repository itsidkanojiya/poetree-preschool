import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/api';
import { logoutAction } from '../login/actions';
import { SubmitButton } from '@/components/ui/form';

const NAV: Record<string, Array<{ href: string; label: string }>> = {
  PUBLICATION_ADMIN: [
    { href: '/publication', label: 'Overview' },
    { href: '/publication/schools', label: 'Schools' },
    { href: '/publication/plans', label: 'Plans' },
  ],
  SCHOOL_ADMIN: [
    { href: '/school', label: 'Overview' },
    { href: '/school/classrooms', label: 'Classrooms' },
    { href: '/school/teachers', label: 'Teachers' },
    { href: '/school/parents', label: 'Parents' },
    { href: '/school/students', label: 'Students' },
  ],
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const links = NAV[user.role] ?? [];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-slate-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Poetree</p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
            {user.school?.name ?? 'Publication'}
          </p>
          <p className="text-xs text-slate-500">
            {user.role === 'PUBLICATION_ADMIN' ? 'Super Admin' : 'School Admin'}
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-slate-100 px-3 py-4 lg:block">
          <p className="truncate px-2 pb-2 text-xs text-slate-500">{user.email ?? user.phone}</p>
          <form action={logoutAction}>
            <SubmitButton variant="secondary" className="w-full">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>

        <div className="mt-10 lg:hidden">
          <form action={logoutAction}>
            <SubmitButton variant="secondary" className="w-full">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </main>
    </div>
  );
}
