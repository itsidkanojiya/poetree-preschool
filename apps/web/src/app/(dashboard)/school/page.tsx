import Link from 'next/link';
import { apiFetch, getCurrentUser } from '@/lib/api';
import { Card, PageHeader, StatTile } from '@/components/ui/layout';
import {
  IconChevronRight,
  IconClassroom,
  IconParents,
  IconStudent,
  IconTeacher,
} from '@/components/icons';

interface SchoolOverview {
  students: number;
  teachers: number;
  parents: number;
  classrooms: number;
}

const STEPS = [
  {
    href: '/school/classrooms',
    label: 'Create the academic year and classrooms',
    detail: 'Everything else hangs off the academic year.',
    icon: <IconClassroom size={18} />,
  },
  {
    href: '/school/teachers',
    label: 'Add teachers',
    detail: 'Then assign them as class teachers.',
    icon: <IconTeacher size={18} />,
  },
  {
    href: '/school/parents',
    label: 'Add parents',
    detail: 'Every child is reached through a guardian account.',
    icon: <IconParents size={18} />,
  },
  {
    href: '/school/students',
    label: 'Add students',
    detail: 'Link each child to their guardian.',
    icon: <IconStudent size={18} />,
  },
];

export default async function SchoolOverviewPage() {
  const [user, overview] = await Promise.all([
    getCurrentUser(),
    apiFetch<SchoolOverview>('/dashboard/overview'),
  ]);

  const empty = overview.students === 0 && overview.teachers === 0;

  return (
    <>
      <PageHeader
        title={user.school?.name ?? 'Your school'}
        description="Everything here is scoped to your school only."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Students" value={overview.students} icon={<IconStudent size={17} />} />
        <StatTile label="Teachers" value={overview.teachers} icon={<IconTeacher size={17} />} />
        <StatTile label="Parents" value={overview.parents} icon={<IconParents size={17} />} />
        <StatTile
          label="Classrooms"
          value={overview.classrooms}
          icon={<IconClassroom size={17} />}
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <Card
          title={empty ? 'Get set up' : 'Quick links'}
          description={empty ? 'Work through these in order.' : undefined}
        >
          <ol className="space-y-2">
            {STEPS.map((step, index) => (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className="group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-navy-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700 group-hover:bg-white">
                    {step.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-navy-950">
                      {empty && (
                        <span className="mr-1.5 text-slate-400">{index + 1}.</span>
                      )}
                      {step.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{step.detail}</span>
                  </span>
                  <IconChevronRight
                    size={17}
                    className="shrink-0 text-slate-300 group-hover:text-navy-600"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
