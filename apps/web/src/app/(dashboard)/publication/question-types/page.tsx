import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { NewActivityForm, RetireButton } from './forms';

export const metadata: Metadata = { title: 'Question types · Poetree Admin' };

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
  searchParams: Promise<{ page?: string; skillId?: string; search?: string }>;
}) {
  const { page = '1', skillId, search } = await searchParams;

  const [activities, skills, classLevels, books] = await Promise.all([
    apiFetch<Paginated<CatalogueActivity>>('/publication/question-types', {
      query: { page, pageSize: 25, skillId, search, includeInactive: 'true' },
    }),
    apiFetch<Skill[]>('/publication/skills'),
    apiFetch<ClassLevel[]>('/publication/class-levels'),
    apiFetch<BookOption[]>('/publication/books'),
  ]);

  const unplayable = activities.items.filter((item) => !item.isPlayable).length;

  return (
    <>
      <PageHeader
        title="Question types"
        description="A page of a book — “Circle the correct letter” — and the questions under it."
      />

      {unplayable > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {unplayable === 1 ? 'One question type has' : `${unplayable} question types have`} no
          questions a child can answer, so {unplayable === 1 ? 'it is' : 'they are'} invisible in
          the app. Open one to add questions.
        </div>
      )}

      <Card className="mb-6">
        {activities.items.length === 0 ? (
          <EmptyState
            title="No question types yet"
            description="Add the first one below — “Circle the correct letter”, say — then write its questions."
          />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'Question type',
                  'Played as',
                  'Book',
                  'Skill',
                  'Level',
                  { label: 'Questions', numeric: true },
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
              basePath="/publication/question-types"
            />
          </>
        )}
      </Card>

      <div className="max-w-3xl">
        <Card title="Add a question type">
          <NewActivityForm skills={skills} classLevels={classLevels} books={books} />
        </Card>
      </div>
    </>
  );
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
