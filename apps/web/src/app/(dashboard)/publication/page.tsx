import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatTile, StatusBadge } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconAlert, IconChevronRight, IconPlus, IconSchool, IconStudent, IconTeacher } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import type { Paginated, SchoolSummary } from '@poetree/shared';

interface Overview {
  schools: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    expiringSoon: number;
  };
  students: number;
  teachers: number;
}

export default async function PublicationOverviewPage() {
  const [overview, recent] = await Promise.all([
    apiFetch<Overview>('/publication/overview'),
    apiFetch<Paginated<SchoolSummary>>('/publication/schools', { query: { pageSize: 6 } }),
  ]);

  const blocked = overview.schools.suspended + overview.schools.expired;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every school on the Poetree platform, at a glance."
        action={
          <Link
            href="/publication/schools/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add school
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Schools"
          value={overview.schools.total}
          icon={<IconSchool size={17} />}
          hint={`${overview.schools.active} active · ${overview.schools.trial} on trial`}
        />
        <StatTile
          label="Blocked"
          value={blocked}
          tone={blocked > 0 ? 'critical' : 'default'}
          icon={<IconAlert size={17} />}
          hint={`${overview.schools.suspended} suspended · ${overview.schools.expired} expired`}
        />
        <StatTile
          label="Students"
          value={overview.students}
          icon={<IconStudent size={17} />}
          hint="Across every school"
        />
        <StatTile
          label="Teachers"
          value={overview.teachers}
          icon={<IconTeacher size={17} />}
          hint="Across every school"
        />
      </div>

      {overview.schools.expiringSoon > 0 && (
        <div className="mt-4">
          <Card tone="accent">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-100 text-gold-700">
                  <IconAlert size={18} />
                </span>
                <div>
                  <p className="font-medium text-navy-950">
                    {overview.schools.expiringSoon} school
                    {overview.schools.expiringSoon === 1 ? '' : 's'} expiring within 30 days
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Access is cut automatically on the expiry date.
                  </p>
                </div>
              </div>
              <Link
                href="/publication/schools"
                className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline"
              >
                Review schools <IconChevronRight size={15} />
              </Link>
            </div>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card
          title="Recently added"
          description="The newest schools on the platform."
          action={
            <Link
              href="/publication/schools"
              className="inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline"
            >
              View all <IconChevronRight size={15} />
            </Link>
          }
        >
          {recent.items.length === 0 ? (
            <EmptyState
              title="No schools yet"
              description="Add the first school to start onboarding Poetree's customers."
              action={
                <Link
                  href="/publication/schools/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
                >
                  <IconPlus size={17} />
                  Add school
                </Link>
              }
            />
          ) : (
            <Table>
              <THead
                columns={[
                  'School',
                  'Status',
                  'Plan',
                  'Expires',
                  { label: 'Students', numeric: true },
                  { label: 'Manage', hidden: true },
                ]}
              />
              <tbody>
                {recent.items.map((school) => {
                  const remaining = daysUntil(school.expiresAt);
                  return (
                    <TRow key={school.id}>
                      <TCell>
                        <TPrimary sub={school.city ?? school.code}>{school.name}</TPrimary>
                      </TCell>
                      <TCell>
                        <StatusBadge status={school.status} />
                      </TCell>
                      <TCell>{school.planName ?? '—'}</TCell>
                      <TCell>
                        {formatDate(school.expiresAt)}
                        {remaining !== null && remaining <= 30 && remaining > 0 && (
                          <span className="mt-0.5 block text-xs text-gold-700">
                            in {remaining} day{remaining === 1 ? '' : 's'}
                          </span>
                        )}
                      </TCell>
                      <TCell numeric>{school.counts.students}</TCell>
                      <TCell className="text-right">
                        <Link
                          href={`/publication/schools/${school.id}`}
                          className="text-sm font-medium text-navy-700 hover:underline"
                        >
                          Manage
                        </Link>
                      </TCell>
                    </TRow>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
