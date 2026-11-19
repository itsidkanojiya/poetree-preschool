import Link from 'next/link';
import type { Metadata } from 'next';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@poetree/shared';
import type {
  CatalogueActivity,
  ChapterOption,
  Paginated,
  StandardSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { TypeFilterBar } from './filters';
import { IconPlus } from '@/components/icons';
import { FOCUS } from '../readiness';
import { Toast } from '@/components/ui/toast';

export const metadata: Metadata = { title: 'Activity types · Poetree Admin' };

interface BookOption {
  id: string;
  name: string;
  classLevel: { name: string };
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
  searchParams: Promise<{
    page?: string;
    classLevelId?: string;
    bookId?: string;
    chapterId?: string;
    type?: string;
    search?: string;
    deleted?: string;
  }>;
}) {
  // `deleted` is the toast after a delete, not a filter for the API.
  const { page = '1', deleted, ...filters } = await searchParams;

  const [activities, books, chapters, standards] = await Promise.all([
    apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
      query: { ...filters, page, pageSize: 25, includeInactive: 'true' },
    }),
    apiFetch<BookOption[]>('/publication/books'),
    apiFetch<ChapterOption[]>('/publication/chapters'),
    apiFetch<StandardSummary[]>('/publication/standards'),
  ]);

  // Carried into the paging links, or page two of a filtered list is page two
  // of the whole catalogue.
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  const basePath = query ? `/publication/question-types?${query}` : '/publication/question-types';
  const unplayable = activities.items.filter((item) => !item.isPlayable).length;

  return (
    <>
      <PageHeader
        title="Activity types"
        description="A page of a book — “Circle the correct letter” — and the activities under it."
        action={
          <Link
            href="/publication/question-types/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add activity type
          </Link>
        }
      />

      <TypeFilterBar filters={filters} standards={standards} books={books} chapters={chapters} />

      {unplayable > 0 && (
        <div className="mb-5">
          <Notice tone="warning">
            {unplayable === 1 ? 'One activity type has' : `${unplayable} activity types have`} no
            activities a child can do, so {unplayable === 1 ? 'it is' : 'they are'} invisible in the
            app. Open one to add activities.
          </Notice>
        </div>
      )}

      {activities.items.length === 0 ? (
        <Card>
          <EmptyState
            title={query ? 'No activity types match' : 'No activity types yet'}
            description={
              query
                ? 'Try another filter, or clear them.'
                : 'Add the first one — “Circle the correct letter”, say — then write its activities.'
            }
          />
        </Card>
      ) : (
        <>
          {/* Phones: a card each, nothing cut off. */}
          <ul className="space-y-3 md:hidden" aria-label="Activity types">
            {activities.items.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/publication/question-types/${activity.id}`}
                  className={`block rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy-950/[0.07] transition-colors hover:ring-navy-950/15 ${FOCUS}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium text-navy-950 [overflow-wrap:anywhere]">
                      {activity.title}
                    </span>
                    <TypeState activity={activity} />
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {playedAs(activity.type)} · <Where activity={activity} />
                  </span>
                  <span className="mt-2 block text-xs tabular-nums text-slate-600">
                    {activity.itemCount} {activity.itemCount === 1 ? 'activity' : 'activities'} ·
                    played {activity.attemptCount} {activity.attemptCount === 1 ? 'time' : 'times'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="md:hidden">
            <Pagination
              page={activities.page}
              totalPages={activities.totalPages}
              total={activities.total}
              basePath={basePath}
              noun={['activity type', 'activity types']}
            />
          </div>

          {/* Laptops: the table — five columns, the book and chapter under the name. */}
          <div className="hidden md:block">
            <Card>
              <Table>
                <THead
                  columns={[
                    'Activity type',
                    'Played as',
                    { label: 'Activities', numeric: true },
                    { label: 'Played', numeric: true },
                    'State',
                  ]}
                />
                <tbody>
                  {activities.items.map((activity) => (
                    <TRow key={activity.id}>
                      <TCell>
                        <TPrimary sub={<Where activity={activity} />}>
                          <Link
                            href={`/publication/question-types/${activity.id}`}
                            className={`rounded-sm hover:text-navy-700 hover:underline ${FOCUS}`}
                          >
                            {activity.title}
                          </Link>
                        </TPrimary>
                      </TCell>
                      <TCell>{playedAs(activity.type)}</TCell>
                      <TCell numeric>
                        <Link
                          href={`/publication/question-types/${activity.id}/questions`}
                          className={`rounded-sm hover:underline ${FOCUS}`}
                          aria-label={`${activity.itemCount} activities in ${activity.title}`}
                        >
                          {activity.itemCount}
                        </Link>
                      </TCell>
                      {/* Across every school. The one number that says whether
                          writing this was worth the afternoon. */}
                      <TCell numeric>{activity.attemptCount}</TCell>
                      <TCell>
                        <TypeState activity={activity} />
                      </TCell>
                    </TRow>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={activities.page}
                totalPages={activities.totalPages}
                total={activities.total}
                basePath={basePath}
                noun={['activity type', 'activity types']}
              />
            </Card>
          </div>
        </>
      )}
      {deleted && <Toast message={`${deleted.slice(0, 120)} is deleted permanently.`} />}
    </>
  );
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/** How the app plays it, in the words the author picked it by. */
const playedAs = (type: string) =>
  ACTIVITY_TYPE_LABELS[type as ActivityType]?.label ?? titleCase(type);

/** Book › chapter, or a warning when it is in no book and so reaches nobody. */
function Where({ activity }: { activity: CatalogueActivity }) {
  if (!activity.book) return <span className="text-gold-700">In no book — reaches nobody</span>;
  return (
    <>
      {activity.book.name}
      {activity.chapter && <> › {activity.chapter.name}</>}
    </>
  );
}

/** Live, switched off, or with nothing a child can do yet. */
function TypeState({ activity }: { activity: CatalogueActivity }) {
  if (!activity.isPlayable) return <Pill tone="gold">No activities</Pill>;
  if (activity.isActive) return <Pill tone="brand">Live</Pill>;
  return <Pill tone="neutral">Off</Pill>;
}
