'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  IconChart,
  IconClassroom,
  IconHome,
  IconParents,
  IconPlan,
  IconSchool,
  IconInbox,
  IconSpark,
  IconStudent,
  IconTeacher,
} from '@/components/icons';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Exact match only — otherwise the section root highlights on every child. */
  exact?: boolean;
}

interface NavGroup {
  heading?: string;
  items: NavItem[];
}

const PUBLICATION_NAV: NavGroup[] = [
  {
    items: [
      { href: '/publication', label: 'Overview', icon: <IconHome size={18} />, exact: true },
      { href: '/publication/schools', label: 'Schools', icon: <IconSchool size={18} /> },
      { href: '/publication/plans', label: 'Plans', icon: <IconPlan size={18} /> },
      { href: '/publication/standards', label: 'Standards', icon: <IconClassroom size={18} /> },
      { href: '/publication/books', label: 'Books', icon: <IconPlan size={18} /> },
      {
        href: '/publication/question-types',
        label: 'Question types',
        icon: <IconSpark size={18} />,
      },
      { href: '/publication/questions', label: 'Questions', icon: <IconInbox size={18} /> },
      { href: '/publication/usage', label: 'Usage', icon: <IconChart size={18} /> },
    ],
  },
];

const SCHOOL_NAV: NavGroup[] = [
  {
    items: [{ href: '/school', label: 'Overview', icon: <IconHome size={18} />, exact: true }],
  },
  {
    heading: 'People',
    items: [
      { href: '/school/teachers', label: 'Teachers', icon: <IconTeacher size={18} /> },
      { href: '/school/parents', label: 'Parents', icon: <IconParents size={18} /> },
      { href: '/school/students', label: 'Students', icon: <IconStudent size={18} /> },
    ],
  },
  {
    heading: 'Money',
    items: [{ href: '/school/fees', label: 'Fees', icon: <IconPlan size={18} /> }],
  },
  {
    heading: 'Academics',
    items: [
      { href: '/school/classrooms', label: 'Classrooms', icon: <IconClassroom size={18} /> },
      { href: '/school/timetable', label: 'Timetable', icon: <IconClassroom size={18} /> },
      { href: '/school/notices', label: 'Notices', icon: <IconInbox size={18} /> },
      { href: '/school/progress', label: 'Progress', icon: <IconSpark size={18} /> },
    ],
  },
  {
    heading: 'Office',
    items: [{ href: '/school/reports', label: 'Reports', icon: <IconChart size={18} /> }],
  },
];

const TEACHER_NAV: NavGroup[] = [
  {
    items: [
      { href: '/teacher', label: 'Today', icon: <IconHome size={18} />, exact: true },
      { href: '/teacher/attendance', label: 'Attendance', icon: <IconClassroom size={18} /> },
      { href: '/teacher/homework', label: 'Homework', icon: <IconPlan size={18} /> },
      { href: '/teacher/stream', label: 'Class stream', icon: <IconInbox size={18} /> },
    ],
  },
];

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();
  const groups =
    role === 'PUBLICATION_ADMIN'
      ? PUBLICATION_NAV
      : role === 'TEACHER'
        ? TEACHER_NAV
        : SCHOOL_NAV;

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-4 lg:pb-0">
      {groups.map((group, index) => (
        <div key={group.heading ?? index} className="flex gap-1 lg:flex-col lg:gap-0.5">
          {group.heading && (
            <p className="mb-1 hidden px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400 lg:block">
              {group.heading}
            </p>
          )}
          {group.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-navy-50 hover:text-navy-900'
                }`}
              >
                <span className={active ? 'text-gold-300' : 'text-slate-400'}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
