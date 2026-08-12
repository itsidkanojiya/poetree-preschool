import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill, StatTile } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconChart, IconSchool, IconSpark } from '@/components/icons';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Usage · Poetree Admin' };

interface UsageReport {
  window: { days: number; since: string };
  totals: { attempts: number; activeChildren: number; schoolsUsing: number };
  schools: Array<{
    schoolId: string;
    schoolName: string;
    status: string;
    students: number;
    activeChildren: number;
    attempts: number;
    lastAttemptAt: string | null;
  }>;
  activities: Array<{
    activityId: string;
    code: string;
    title: string;
    type: string;
    isActive: boolean;
    attempts: number;
    schools: number;
    averageScore: number | null;
  }>;
  neverPlayed: Array<{ activityId: string; code: string; title: string }>;
}

/**
 * Whether the product is being opened.
 *
 * Every figure is shown with its basis, as on the progress screens. "12%" is a
 * verdict nobody can act on; "7 of 58 children played something this month" is
 * a phone call to a school that needs help.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days = '30' } = await searchParams;
  const report = await apiFetch<UsageReport>('/publication/usage', { query: { days } });

  const quiet = report.schools.filter(
    (school) => school.students > 0 && school.attempts === 0,
  );

  return (
    <>
      <PageHeader
        title="Usage"
        description={`Since ${formatDate(report.window.since)}. Schools and plans say what has been sold; this says what is being opened.`}
      />

      <div className="mb-5 flex gap-2">
        {[7, 30, 90].map((option) => (
          <Link
            key={option}
            href={`/publication/usage?days=${option}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              String(option) === days
                ? 'bg-navy-900 text-white'
                : 'text-navy-900 ring-1 ring-navy-200 hover:bg-navy-50'
            }`}
          >
            {option} days
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Children who played" value={report.totals.activeChildren} icon={<IconSpark size={18} />} />
        <StatTile label="Activities opened" value={report.totals.attempts} icon={<IconChart size={18} />} />
        <StatTile label="Schools using it" value={report.totals.schoolsUsing} icon={<IconSchool size={18} />} />
      </div>

      {quiet.length > 0 && (
        <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong className="font-semibold">
            {quiet.length === 1 ? 'One school has' : `${quiet.length} schools have`} children
            enrolled and nothing played.
          </strong>{' '}
          {quiet.map((school) => school.schoolName).join(', ')}. Worth a call before the renewal
          rather than after it.
        </div>
      )}

      <Card className="mb-6" title="By school">
        {report.schools.length === 0 ? (
          <EmptyState title="No schools yet" description="Add one and this fills itself in." />
        ) : (
          <Table>
            <THead
              columns={[
                'School',
                { label: 'Children', numeric: true },
                { label: 'Played', numeric: true },
                { label: 'Attempts', numeric: true },
                'Last used',
              ]}
            />
            <tbody>
              {report.schools.map((school) => (
                <TRow key={school.schoolId}>
                  <TCell>
                    <Link href={`/publication/schools/${school.schoolId}`} className="hover:underline">
                      <TPrimary sub={school.status.toLowerCase()}>{school.schoolName}</TPrimary>
                    </Link>
                  </TCell>
                  <TCell numeric>{school.students}</TCell>
                  {/* Distinct children, not attempts: one child playing forty
                      times is one child using it. */}
                  <TCell numeric>
                    {school.activeChildren}
                    {school.students > 0 && (
                      <span className="ml-1 text-xs text-slate-400">
                        of {school.students}
                      </span>
                    )}
                  </TCell>
                  <TCell numeric>{school.attempts}</TCell>
                  <TCell>
                    {school.lastAttemptAt ? (
                      formatDate(school.lastAttemptAt)
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {report.neverPlayed.length > 0 && (
        <Card
          className="mb-6"
          title="Written but never opened"
          description="Live activities no child at any school has ever played. The work that did not land."
        >
          <ul className="flex flex-wrap gap-2">
            {report.neverPlayed.map((activity) => (
              <li key={activity.activityId}>
                <Link
                  href={`/publication/activities/${activity.activityId}`}
                  className="inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-navy-900 hover:bg-slate-200"
                >
                  {activity.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="By activity">
        <Table>
          <THead
            columns={[
              'Activity',
              'Type',
              { label: 'Attempts', numeric: true },
              { label: 'Schools', numeric: true },
              { label: 'Average', numeric: true },
              'State',
            ]}
          />
          <tbody>
            {report.activities.map((activity) => (
              <TRow key={activity.activityId}>
                <TCell>
                  <Link
                    href={`/publication/activities/${activity.activityId}`}
                    className="hover:underline"
                  >
                    <TPrimary sub={activity.code}>{activity.title}</TPrimary>
                  </Link>
                </TCell>
                <TCell>{activity.type.charAt(0) + activity.type.slice(1).toLowerCase()}</TCell>
                <TCell numeric>{activity.attempts}</TCell>
                <TCell numeric>{activity.schools}</TCell>
                <TCell numeric>
                  {/* Null, not zero, when nothing was asked — 0% would read as
                      an activity every child failed. */}
                  {activity.averageScore === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    `${activity.averageScore}%`
                  )}
                </TCell>
                <TCell>
                  {activity.isActive ? (
                    <Pill tone="brand">Live</Pill>
                  ) : (
                    <Pill tone="neutral">Retired</Pill>
                  )}
                </TCell>
              </TRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
