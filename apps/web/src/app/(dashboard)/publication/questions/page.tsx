import Link from 'next/link';
import type { Metadata } from 'next';
import type {
  BookSummary,
  ChapterOption,
  Paginated,
  QuestionWithContext,
  StandardSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { QuestionFilterBar } from './filters';
import { allActivities } from './all-activities';
import { IconPlus } from '@/components/icons';

export const metadata: Metadata = { title: 'Questions · Poetree Admin' };

/**
 * Every question in the catalogue.
 *
 * The question-type screen is where a page is written, one question after
 * another. This is the other view of the same rows: everything that exists,
 * filtered by book, so a question can be found without remembering which page
 * it was on.
 *
 * Editing still happens on the page it belongs to — a question out of the
 * context of its instruction is not something anybody can judge.
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    classLevelId?: string;
    bookId?: string;
    chapterId?: string;
    activityId?: string;
    type?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const { page = '1', ...filters } = await searchParams;

  const [questions, standards, books, chapters, types] = await Promise.all([
    apiFetch<Paginated<QuestionWithContext>>('/publication/questions', {
      query: { ...filters, page, pageSize: 50 },
    }),
    apiFetch<StandardSummary[]>('/publication/standards'),
    apiFetch<BookSummary[]>('/publication/books'),
    apiFetch<ChapterOption[]>('/publication/chapters'),
    allActivities(),
  ]);

  const broken = questions.items.filter((question) => question.problem !== null);

  // A question cannot exist on its own — it belongs to a question type, which
  // is the page it is printed on. So Add goes straight to that page when the
  // filters have already named one, and to the list of them when they have not,
  // because choosing the page is the first thing to do either way.
  const chosenType = filters.activityId
    ? types.items.find((type) => type.id === filters.activityId)
    : undefined;

  // Carried into the paging links: without this, page two of a filtered list is
  // page two of the whole catalogue, which looks like the filter forgot itself.
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <>
      <PageHeader
        title="Questions"
        description={
          Object.values(filters).some(Boolean)
            ? `${questions.total} ${questions.total === 1 ? 'question' : 'questions'} match. Open one to edit it on its page.`
            : 'Every question in the catalogue. Open the one you want and edit it on its page.'
        }
        action={
          <Link
            href={
              chosenType
                ? `/publication/question-types/${chosenType.id}/questions`
                : '/publication/question-types'
            }
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <IconPlus size={17} />
            {chosenType ? `Add to ${chosenType.title}` : 'Add question'}
          </Link>
        }
      />

      <QuestionFilterBar
        filters={filters}
        standards={standards}
        books={books}
        chapters={chapters}
        types={types.items}
      />

      {broken.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {broken.length === 1 ? 'One question is' : `${broken.length} questions are`} not being
          shown to children. They are marked below.
        </div>
      )}

      <Card>
        {questions.items.length === 0 ? (
          <EmptyState
            title="No questions yet"
            description="Add a question type first, then write its questions."
          />
        ) : (
          <>
            <Table>
              <THead
                columns={['Question', 'Question type', 'Book', 'Chapter', 'Answer', 'State']}
              />
              <tbody>
                {questions.items.map((question) => (
                  <TRow key={question.id}>
                    <TCell>
                      <Link
                        href={`/publication/question-types/${question.activityId}/questions`}
                        className="hover:underline"
                      >
                        <TPrimary
                          sub={
                            question.options.length > 0
                              ? `${question.options.length} choices`
                              : undefined
                          }
                        >
                          {question.say}
                        </TPrimary>
                      </Link>
                    </TCell>
                    <TCell>{question.activity.title}</TCell>
                    <TCell>
                      {question.book ? (
                        question.book.name
                      ) : (
                        /* Reaches nobody: schools are given books, not loose
                           pages. */
                        <span className="text-amber-700">No book</span>
                      )}
                    </TCell>
                    <TCell>
                      {question.chapter?.name ?? <span className="text-slate-400">—</span>}
                    </TCell>
                    <TCell>
                      <Answer question={question} />
                    </TCell>
                    <TCell>
                      {question.problem ? (
                        <Pill tone="neutral">{question.problem}</Pill>
                      ) : (
                        <Pill tone="brand">Ready</Pill>
                      )}
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={questions.page}
              totalPages={questions.totalPages}
              total={questions.total}
              basePath={
                query ? `/publication/questions?${query}` : '/publication/questions'
              }
            />
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        {types.total} question {types.total === 1 ? 'type' : 'types'} in the catalogue.
        {!chosenType && ' A question is written on one of them — pick the type to add to.'}
      </p>
    </>
  );
}

/** What a child has to tap, shown so the list can be read without opening each. */
function Answer({ question }: { question: QuestionWithContext }) {
  if (question.strokes && question.strokes.length > 0) {
    return (
      <span className="text-xs text-slate-500">
        {question.strokes.length} {question.strokes.length === 1 ? 'stroke' : 'strokes'}
      </span>
    );
  }

  const correct = question.options.find((option) => option.isCorrect);
  if (!correct) return <span className="text-xs text-slate-400">—</span>;

  if (correct.imageUrl) {
    const id = correct.imageUrl.split('/').pop();
    return (
      /* Through the proxy, because the asset route wants the cookie's token.
         A plain img: one thumbnail from our own API. */
      <img
        src={`/attachments?kind=catalogue&id=${id}`}
        alt=""
        className="h-9 w-9 rounded-lg object-contain ring-1 ring-navy-950/10"
      />
    );
  }

  return <span className="text-sm">{correct.glyph ?? correct.text}</span>;
}
