import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity, QuestionRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AddQuestionForm, EditQuestionForm, QuestionControls } from './forms';

export const metadata: Metadata = { title: 'Questions · Poetree Admin' };

/** The types a child answers rather than simply looks at. */
const SCORED = ['TRACING', 'MATCHING', 'COUNTING', 'SORTING', 'COLOURING'];

/**
 * The questions on one page of a book.
 *
 * "Circle the correct letter" is the page; these are the rows on it. Added one
 * at a time, because that is how somebody works through a workbook they are
 * copying in.
 */
export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [activity, questions] = await Promise.all([
    apiFetch<CatalogueActivity>(`/publication/activities/${id}`),
    apiFetch<QuestionRow[]>(`/publication/activities/${id}/questions`),
  ]);

  const scored = SCORED.includes(activity.type);
  const tracing = activity.type === 'TRACING';
  const broken = questions.filter((question) => question.problem !== null);

  return (
    <>
      <Link
        href={`/publication/activities/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900"
      >
        <IconArrowLeft size={16} /> {activity.title}
      </Link>

      <PageHeader
        title="Questions"
        description={`${activity.title}${activity.book ? ` · ${activity.book.name}` : ''}`}
      />

      {broken.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {broken.length === 1 ? 'One question is' : `${broken.length} questions are`} not being
          shown to children: {broken.map((question) => question.problem).join('; ')}.
        </div>
      )}

      {questions.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            title="No questions yet"
            description="Add the first one below. Until then this page reaches nobody."
          />
        </Card>
      ) : (
        <div className="mb-6 space-y-4">
          {questions.map((question, index) => (
            <Card key={question.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {index + 1}
                  </span>
                  {question.problem ? (
                    <Pill tone="neutral">{question.problem}</Pill>
                  ) : (
                    <Pill tone="brand">Ready</Pill>
                  )}
                </span>
                <QuestionControls
                  activityId={id}
                  question={question}
                  previous={questions[index - 1]}
                  next={questions[index + 1]}
                />
              </div>

              <EditQuestionForm
                activityId={id}
                question={question}
                scored={scored}
                tracing={tracing}
              />
            </Card>
          ))}
        </div>
      )}

      <div className="max-w-3xl">
        <Card
          title="Add a question"
          description={
            tracing
              ? 'Draw the path a child follows with their finger.'
              : scored
                ? 'A picture, an emoji or a word on each choice. Tick the right one.'
                : 'Something to look at. Nothing to get wrong.'
          }
        >
          <AddQuestionForm
            activityId={id}
            scored={scored}
            tracing={tracing}
            count={questions.length}
          />
        </Card>
      </div>
    </>
  );
}
