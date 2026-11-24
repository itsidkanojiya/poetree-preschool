'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  IconAward,
  IconCalendar,
  IconChart,
  IconClipboard,
  IconDownload,
  IconClassroom,
  IconHome,
  IconImage,
  IconMegaphone,
  IconParents,
  IconPlan,
  IconReport,
  IconRupee,
  IconSchool,
  IconInbox,
  IconSettings,
  IconSpark,
  IconStar,
  IconStudent,
  IconTeacher,
  IconTrace,
  IconGame,
  IconCloud,
} from '@/components/icons';

/**
 * Each part of the school has its colour — people sky, money green, classes
 * violet, the office amber — on its icons and on the page you are on, so where
 * you are reads at a glance.
 */
type Tone = 'home' | 'people' | 'money' | 'classes' | 'office';

const TONES: Record<Tone, { active: string; icon: string; badge: string }> = {
  home: { active: 'bg-navy-900 text-white', icon: 'text-navy-600', badge: 'bg-rose-500' },
  people: { active: 'bg-sky-600 text-white', icon: 'text-sky-600', badge: 'bg-rose-500' },
  money: { active: 'bg-emerald-600 text-white', icon: 'text-emerald-600', badge: 'bg-rose-500' },
  classes: { active: 'bg-violet-600 text-white', icon: 'text-violet-600', badge: 'bg-rose-500' },
  office: { active: 'bg-amber-600 text-white', icon: 'text-amber-600', badge: 'bg-rose-500' },
};

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Exact match only — otherwise the section root highlights on every child. */
  exact?: boolean;
  /** Other addresses that belong to this section, such as a tab inside it. */
  also?: string[];
}

interface NavGroup {
  heading?: string;
  tone?: Tone;
  items: NavItem[];
}

// Grouped the way the School Admin's is, so a page is found by what it is
// about rather than by reading a list of eleven. Same pages, same addresses.
const PUBLICATION_NAV: NavGroup[] = [
  {
    items: [{ href: '/publication', label: 'Overview', icon: <IconHome size={18} />, exact: true }],
  },
  {
    heading: 'Customers',
    items: [
      { href: '/publication/schools', label: 'Schools', icon: <IconSchool size={18} /> },
      { href: '/publication/organisations', label: 'Groups', icon: <IconParents size={18} /> },
    ],
  },
  {
    heading: 'Content',
    items: [
      { href: '/publication/books', label: 'Books', icon: <IconPlan size={18} /> },
      {
        href: '/publication/question-types',
        label: 'Activity types',
        icon: <IconSpark size={18} />,
      },
      { href: '/publication/questions', label: 'Activities', icon: <IconInbox size={18} /> },
      // The tracing module: its switch for every school, and each letter's video.
      { href: '/publication/tracing', label: 'Tracing', icon: <IconTrace size={18} /> },
      { href: '/publication/games', label: 'Games', icon: <IconGame size={18} /> },
    ],
  },
  {
    heading: 'Data',
    items: [
      { href: '/publication/usage', label: 'Usage', icon: <IconChart size={18} /> },
      // Records across schools as Excel files.
      { href: '/publication/exports', label: 'Export data', icon: <IconDownload size={18} /> },
    ],
  },
  {
    heading: 'Settings',
    items: [
      // Poetree's Google sign-in, through which each school connects its own Drive.
      { href: '/publication/google-drive', label: 'Google Drive', icon: <IconCloud size={18} /> },
    ],
  },
];

const SCHOOL_NAV: NavGroup[] = [
  {
    tone: 'home',
    items: [{ href: '/school', label: 'Overview', icon: <IconHome size={18} />, exact: true }],
  },
  {
    heading: 'People',
    tone: 'people',
    items: [
      // Parents are a tab of Students: a child and their family in one place.
      {
        href: '/school/students',
        label: 'Students',
        icon: <IconStudent size={18} />,
        also: ['/school/parents'],
      },
      { href: '/school/teachers', label: 'Teachers', icon: <IconTeacher size={18} /> },
      // Families waiting to be let in. Beside the people it will turn into.
      { href: '/school/registrations', label: 'Registrations', icon: <IconClipboard size={18} /> },
    ],
  },
  {
    heading: 'Money',
    tone: 'money',
    items: [{ href: '/school/fees', label: 'Fees', icon: <IconRupee size={18} /> }],
  },
  {
    heading: 'Classes',
    tone: 'classes',
    items: [
      { href: '/school/classrooms', label: 'Classrooms', icon: <IconClassroom size={18} /> },
      { href: '/school/timetable', label: 'Timetable', icon: <IconCalendar size={18} /> },
      // Term report cards: set up here, filled in by class teachers, sent from here.
      { href: '/school/results', label: 'Results', icon: <IconReport size={18} /> },
      { href: '/school/progress', label: 'Progress', icon: <IconStar size={18} /> },
    ],
  },
  {
    heading: 'Office',
    tone: 'office',
    items: [
      { href: '/school/notices', label: 'Announcements', icon: <IconMegaphone size={18} /> },
      { href: '/school/gallery', label: 'Gallery', icon: <IconImage size={18} /> },
      { href: '/school/reports', label: 'Reports', icon: <IconChart size={18} /> },
      { href: '/school/certificates', label: 'Certificates', icon: <IconAward size={18} /> },
    ],
  },
  {
    tone: 'home',
    // The school's own record, ID cards and numbering: kept apart, at the foot.
    items: [{ href: '/school/settings', label: 'Settings', icon: <IconSettings size={18} /> }],
  },
];

const TEACHER_NAV: NavGroup[] = [
  {
    tone: 'classes',
    items: [
      { href: '/teacher', label: 'Today', icon: <IconHome size={18} />, exact: true },
      { href: '/teacher/attendance', label: 'Attendance', icon: <IconCalendar size={18} /> },
      { href: '/teacher/homework', label: 'Homework', icon: <IconPlan size={18} /> },
      { href: '/teacher/stream', label: 'Class stream', icon: <IconMegaphone size={18} /> },
      { href: '/teacher/results', label: 'Report cards', icon: <IconReport size={18} /> },
    ],
  },
];

/** A group administrator's way back out of the branch they are in. */
const BRANCH_SWITCH: NavGroup = {
  heading: 'Group',
  items: [{ href: '/organisation', label: 'Switch branch', icon: <IconSchool size={18} /> }],
};

export function SidebarNav({
  role,
  badges = {},
}: {
  role: string;
  /** Counts beside a link, by its address: what is waiting there. */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const groups =
    role === 'PUBLICATION_ADMIN'
      ? PUBLICATION_NAV
      : role === 'TEACHER'
        ? TEACHER_NAV
        : role === 'ORG_ADMIN'
          ? [...SCHOOL_NAV, BRANCH_SWITCH]
          : SCHOOL_NAV;

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-3 lg:overflow-visible lg:px-4 lg:pb-0">
      {groups.map((group, index) => {
        const tone = TONES[group.tone ?? 'home'];
        return (
          <div key={group.heading ?? index} className="flex gap-1 lg:flex-col lg:gap-0.5">
            {group.heading && (
              <p className="mb-1 hidden px-3 text-[0.68rem] font-bold uppercase tracking-widest text-slate-400 lg:block">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : [item.href, ...(item.also ?? [])].some(
                    (href) => pathname === href || pathname.startsWith(`${href}/`),
                  );
              const count = badges[item.href] ?? 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-[0.9375rem] font-semibold transition-colors ${
                    active
                      ? `${tone.active} shadow-raised`
                      : 'text-slate-700 hover:bg-slate-100 hover:text-navy-950'
                  }`}
                >
                  <span className={active ? 'text-white' : tone.icon}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span
                      className={`ml-2 min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-bold text-white ${tone.badge}`}
                      aria-label={`${count} waiting`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
