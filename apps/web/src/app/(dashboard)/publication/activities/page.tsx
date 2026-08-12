import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { NewActivityForm, RetireButton } from './forms';

export const metadata: Metadata = { title: 'Activities · Poetree Admin' };

interface Skill {
  id: string;
  code: string;
  name: string;
}

interface ClassLevel {
  id: string;
  code: string;
  name: string;
}

/**
 * The publisher's own product.
 *
 * Poetree writes an activity once and every school it sells to plays that same
 * one — which is what makes "80% on letter recognition" mean the same thing at
 * one school as at the next. No school can author, edit or retire one.
 */
export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; skillId?: string; search?: string }>;
}) {
  const { page = '1', skillId, search } = await searchParams;

  const [activities, skills, classLevels] = await Promise.all([
    apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
      query: { page, pageSize: 25, skillId, search, includeInactive: 'true' },
    }),
    apiFetch<Skill[]>('/publication/skills'),
    apiFetch<ClassLevel[]>('/publication/class-levels'),
  ]);

  const unplayable = activities.items.filter((item) => !item.isPlayable).length;

  return (
    <>
      <PageHeader
        title="Activities"
        description="What children play, written here and shared by every school."
      />

      {unplayable > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {unplayable === 1 ? 'One activity has' : `${unplayable} activities have`} content the
          app cannot read, so {unplayable === 1 ? 'it is' : 'they are'} invisible to every child.
        </div>
      )}

      <Card className="mb-6">
        {activities.items.length === 0 ? (
          <EmptyState
            title="No activities yet"
            description="Write the first one below. Every school will be able to play it."
          />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'Activity',
                  'Type',
                  'Skill',
                  'Level',
                  { label: 'Items', numeric: true },
                  { label: 'Played', numeric: true },
                  'State',
                  '',
                ]}
              />
              <tbody>
                {activities.items.map((activity) => (
                  <TRow key={activity.id}>
                    <TCell>
                      <Link
                        href={`/publication/activities/${activity.id}`}
                        className="hover:underline"
                      >
                        <TPrimary sub={activity.code}>{activity.title}</TPrimary>
                      </Link>
                    </TCell>
                    <TCell>{titleCase(activity.type)}</TCell>
                    <TCell>{activity.skill.name}</TCell>
                    <TCell>{activity.classLevelCode ?? 'Every level'}</TCell>
                    <TCell numeric>{activity.itemCount}</TCell>
                    {/* Across every school. The one number that says whether
                        writing this was worth the afternoon. */}
                    <TCell numeric>{activity.attemptCount}</TCell>
                    <TCell>
                      {!activity.isPlayable ? (
                        <Pill tone="neutral">Unreadable</Pill>
                      ) : activity.isActive ? (
                        <Pill tone="brand">Live</Pill>
                      ) : (
                        <Pill tone="neutral">Retired</Pill>
                      )}
                    </TCell>
                    <TCell>
                      <RetireButton activity={activity} />
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={activities.page}
              totalPages={activities.totalPages}
              total={activities.total}
              basePath="/publication/activities"
            />
          </>
        )}
      </Card>

      <div className="max-w-3xl">
        <Card title="Write an activity">
          <NewActivityForm skills={skills} classLevels={classLevels} />
        </Card>
      </div>
    </>
  );
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
