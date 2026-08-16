import Link from 'next/link';
import type { Metadata } from 'next';
import type {
  CatalogueActivity,
  ChapterOption,
  Paginated,
  StandardSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { TypeFilterBar } from './filters';
import { IconPlus } from '@/components/icons';

export const metadata: Metadata = { title: 'Question types · Poetree Admin' };

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
  }>;
}) {
  const { page = '1', ...filters } = await searchParams;

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

  const unplayable = activities.items.filter((item) => !item.isPlayable).length;

  return (
    <>
      <PageHeader
        title="Question types"
        description="A page of a book — “Circle the correct letter” — and the questions under it."
        action={
          <Link
            href="/publication/question-types/new"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            Add question type
          </Link>
        }
      />

      <TypeFilterBar filters={filters} standards={standards} books={books} chapters={chapters} />

      {unplayable > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {unplayable === 1 ? 'One question type has' : `${unplayable} question types have`} no
          questions a child can answer, so {unplayable === 1 ? 'it is' : 'they are'} invisible in
          the app. Open one to add questions.
        </div>
      )}

      <Card>
        {activities.items.length === 0 ? (
          <EmptyState
            title="No question types yet"
            description="Add the first one — “Circle the correct letter”, say — then write its questions."
          />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'Question type',
                  'Played as',
                  'Book',
                  'Chapter',
                  'Skill',
                  'Level',
                  { label: 'Questions', numeric: true },
                  { label: 'Played', numeric: true },
                  'State',
                ]}
              />
              <tbody>
                {activities.items.map((activity) => (
                  <TRow key={activity.id}>
                    <TCell>
                      <Link
                        href={`/publication/question-types/${activity.id}`}
                        className="hover:underline"
                      >
                        <TPrimary sub={activity.code}>{activity.title}</TPrimary>
                      </Link>
                    </TCell>
                    <TCell>{titleCase(activity.type)}</TCell>
                    <TCell>
                      {activity.book ? (
                        activity.book.name
                      ) : (
                        /* Reaches nobody: a school is given books, not loose
                           question types. */
                        <span className="text-amber-700">No book</span>
                      )}
                    </TCell>
                    <TCell>
                      {activity.chapter?.name ?? <span className="text-slate-400">—</span>}
                    </TCell>
                    <TCell>{activity.skill.name}</TCell>
                    <TCell>{activity.classLevelCode ?? 'Every level'}</TCell>
                    <TCell numeric>
                      <Link
                        href={`/publication/question-types/${activity.id}/questions`}
                        className="hover:underline"
                      >
                        {activity.itemCount}
                      </Link>
                    </TCell>
                    {/* Across every school. The one number that says whether
                        writing this was worth the afternoon. */}
                    <TCell numeric>{activity.attemptCount}</TCell>
                    <TCell>
                      {!activity.isPlayable ? (
                        <Pill tone="neutral">No questions</Pill>
                      ) : activity.isActive ? (
                        <Pill tone="brand">Live</Pill>
                      ) : (
                        <Pill tone="neutral">Retired</Pill>
                      )}
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={activities.page}
              totalPages={activities.totalPages}
              total={activities.total}
              basePath={
                query ? `/publication/question-types?${query}` : '/publication/question-types'
              }
            />
          </>
        )}
      </Card>
    </>
  );
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
