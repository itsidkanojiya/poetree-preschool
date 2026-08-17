import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity, QuestionRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { EditQuestionForm, QuestionControls } from '../forms';

export const metadata: Metadata = { title: 'Question · Poetree Admin' };

/** The types a child answers rather than simply looks at. */
const SCORED = ['TRACING', 'MATCHING', 'COUNTING', 'SORTING', 'COLOURING'];

/**
 * One question, on its own.
 *
 * The catalogue-wide Questions list used to open the whole page a question sat
 * on, which meant finding it again among twenty others before you could change
 * the word you had come to change. Clicking a question now opens that question.
 *
 * Its neighbours are still one click away, because a question is written
 * against the ones beside it — "which one starts with C" only makes sense in a
 * run of them.
 */
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string; questionId: string }>;
}) {
  const { id, questionId } = await params;

  const [activity, questions] = await Promise.all([
    apiFetch<CatalogueActivity>(`/publication/activities/${id}`),
    apiFetch<QuestionRow[]>(`/publication/activities/${id}/questions`),
  ]);

  const index = questions.findIndex((row) => row.id === questionId);
  const question = questions[index];

  if (!question) {
    return (
      <EmptyState
        title="Question not found"
        description="It may have been removed. Open the question type to see what is left."
      />
    );
  }

  const scored = SCORED.includes(activity.type);
  const tracing = activity.type === 'TRACING';
  const previous = questions[index - 1];
  const next = questions[index + 1];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/publication/question-types/${id}/questions`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            {activity.title}
          </Link>
        }
        title={`Question ${index + 1} of ${questions.length}`}
        description={activity.book ? `${activity.book.name}${activity.chapter ? ` · ${activity.chapter.name}` : ''}` : undefined}
        action={
          question.problem ? (
            <Pill tone="neutral">{question.problem}</Pill>
          ) : (
            <Pill tone="brand">Ready</Pill>
          )
        }
      />

      <div className="max-w-3xl space-y-4">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 border-b border-navy-950/[0.06] pb-4">
            <QuestionControls
              activityId={id}
              question={question}
              previous={previous}
              next={next}
            />
          </div>

          <EditQuestionForm
            activityId={id}
            question={question}
            scored={scored}
            tracing={tracing}
          />
        </Card>

        {/* A question is written against the ones beside it — "which one starts
            with C" only makes sense in a run of them. */}
        <div className="flex items-center justify-between gap-3">
          {previous ? (
            <Link
              href={`/publication/question-types/${id}/questions/${previous.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-900 hover:underline"
            >
              <IconArrowLeft size={16} />
              Previous question
            </Link>
          ) : (
            <span />
          )}

          {next && (
            <Link
              href={`/publication/question-types/${id}/questions/${next.id}`}
              className="text-sm font-medium text-navy-900 hover:underline"
            >
              Next question →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
