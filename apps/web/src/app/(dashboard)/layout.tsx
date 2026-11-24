import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { apiFetch, getCurrentUser } from '@/lib/api';
import { logoutAction } from '../login/actions';
import { SubmitButton } from '@/components/ui/form';
import { Avatar, StatusBadge } from '@/components/ui/layout';
import { IconLogout, IconShield } from '@/components/icons';
import { SidebarNav } from './nav';
import { HeaderSearch } from './header-search';

/** The counts beside the menu: what is waiting on the office. Never fatal. */
async function officeBadges(): Promise<Record<string, number>> {
  try {
    const waiting = await apiFetch<{ registrations: number; payments: number; overdue: number }>(
      '/dashboard/attention',
      { redirectOnAuthFailure: false },
    );
    return {
      '/school/registrations': waiting.registrations,
      '/school/fees': waiting.payments,
    };
  } catch {
    return {};
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const isSuperAdmin = user.role === 'PUBLICATION_ADMIN';
  // The office's own pages: a search for any child, and counts in the menu.
  const isOffice = user.role === 'SCHOOL_ADMIN' || user.role === 'ORG_ADMIN';
  const badges = isOffice && user.school ? await officeBadges() : {};

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar. Light rather than dark: admins are in here all day, and the
          brand mark sits on white without needing a knocked-out variant. */}
      <aside className="z-20 border-b border-navy-950/[0.08] bg-white lg:sticky lg:top-0 lg:h-screen lg:w-[16.5rem] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <Link
            href={isSuperAdmin ? '/publication' : '/school'}
            className="flex items-center gap-2.5 px-5 py-4"
          >
            <Image
              src="/poetree.png"
              alt=""
              width={44}
              height={44}
              className="h-10 w-10 shrink-0 object-contain"
              priority
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight text-navy-950">
                Poetree
              </span>
              <span className="block text-[0.7rem] leading-tight text-slate-500">Admin Portal</span>
            </span>
          </Link>

          <div className="mx-4 mb-4 hidden rounded-xl bg-navy-50 px-3.5 py-3 lg:block">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-widest text-navy-600">
              <IconShield size={12} strokeWidth={2.25} />
              {isSuperAdmin ? 'Super Admin' : user.role === 'TEACHER' ? 'Teacher' : 'School Admin'}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-navy-950">
              {user.school?.name ?? 'Poetree Publication'}
            </p>
            {user.school && (
              <p className="mt-1.5">
                <StatusBadge status={user.school.status} />
              </p>
            )}
          </div>

          <SidebarNav role={user.role} badges={badges} />

          <div className="mt-auto hidden border-t border-navy-950/[0.06] p-4 lg:block">
            <Link
              href="/account"
              className="mb-3 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-navy-50"
            >
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-950">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.email ?? user.phone}</p>
              </div>
            </Link>
            <form action={logoutAction}>
              <SubmitButton variant="secondary" className="w-full" pendingLabel="Signing out…">
                <IconLogout size={16} />
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {isOffice && user.school && (
          <header className="sticky top-0 z-10 border-b border-navy-950/[0.06] bg-[#f6f7fa]/90 px-4 py-3 backdrop-blur sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
              <HeaderSearch />
            </div>
          </header>
        )}
        <main className="px-4 py-7 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        <div className="px-4 pb-8 sm:px-8 lg:hidden">
          <form action={logoutAction}>
            <SubmitButton variant="secondary" className="w-full">
              <IconLogout size={16} />
              Sign out — {user.name}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
