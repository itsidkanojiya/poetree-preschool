import Link from 'next/link';
import { apiFetch, getCurrentUser } from '@/lib/api';
import { Card, PageHeader, StatTile } from '@/components/ui/layout';

interface SchoolOverview {
  students: number;
  teachers: number;
  parents: number;
  classrooms: number;
}

export default async function SchoolOverviewPage() {
  const [user, overview] = await Promise.all([
    getCurrentUser(),
    apiFetch<SchoolOverview>('/dashboard/overview'),
  ]);

  return (
    <>
      <PageHeader
        title={user.school?.name ?? 'Your school'}
        description="Everything here is scoped to your school only."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students" value={overview.students} />
        <StatTile label="Teachers" value={overview.teachers} />
        <StatTile label="Parents" value={overview.parents} />
        <StatTile label="Classrooms" value={overview.classrooms} />
      </div>

      <Card className="mt-6" title="Getting set up">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>
            <Link className="text-brand-700 hover:underline" href="/school/classrooms">
              Create the academic year and classrooms
            </Link>
          </li>
          <li>
            <Link className="text-brand-700 hover:underline" href="/school/teachers">
              Add teachers
            </Link>{' '}
            and assign class teachers
          </li>
          <li>
            <Link className="text-brand-700 hover:underline" href="/school/parents">
              Add parents
            </Link>{' '}
            — every child is reached through a guardian account
          </li>
          <li>
            <Link className="text-brand-700 hover:underline" href="/school/students">
              Add students
            </Link>{' '}
            and link them to their guardian
          </li>
        </ol>
      </Card>
    </>
  );
}
