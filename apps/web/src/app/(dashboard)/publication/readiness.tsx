import type { ReactNode } from 'react';
import Link from 'next/link';
import { IconAlert, IconCheck } from '@/components/icons';

/** One focus style for everything clickable, so keyboard users never lose their place. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2';

/**
 * The strip across the top of a book's or a school's page: the few facts that
 * say whether it is ready, each marked done, needs doing, or just information.
 *
 * The mark is a shape as well as a colour, so it reads without colour vision.
 */
export function Readiness({
  label,
  columns = 6,
  children,
}: {
  /** Names the strip for screen readers ("Readiness", "Set-up"). */
  label: string;
  /** How many facts sit in one row on a wide screen. */
  columns?: 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  const wide = {
    3: 'xl:grid-cols-3',
    4: 'xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    6: 'xl:grid-cols-6',
  }[columns];
  return (
    <section
      aria-label={label}
      className={`mb-6 grid grid-cols-2 gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy-950/[0.07] md:grid-cols-3 ${wide}`}
    >
      {children}
    </section>
  );
}

/**
 * One fact. With an `href` it is also the way to the place that changes it —
 * "Books: none chosen" opens the Books tab.
 */
export function Check({
  label,
  value,
  state,
  href,
}: {
  label: string;
  value: ReactNode;
  state: 'done' | 'todo' | 'info';
  href?: string;
}) {
  const mark = {
    done: { box: 'bg-leaf-50 text-leaf-700', icon: <IconCheck size={15} strokeWidth={2.25} /> },
    todo: { box: 'bg-gold-50 text-gold-700', icon: <IconAlert size={15} strokeWidth={2} /> },
    info: { box: 'bg-navy-50 text-navy-700', icon: null },
  }[state];

  const body = (
    <>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${mark.box}`}
        aria-hidden="true"
      >
        {mark.icon ?? <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block text-sm font-medium text-navy-950 [overflow-wrap:anywhere]">
          {value}
        </span>
      </span>
    </>
  );

  if (!href) return <div className="flex items-center gap-3">{body}</div>;

  return (
    <Link
      href={href}
      className={`-m-1.5 flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-navy-50 ${FOCUS}`}
    >
      {body}
    </Link>
  );
}
