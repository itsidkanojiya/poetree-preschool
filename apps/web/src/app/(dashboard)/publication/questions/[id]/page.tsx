import Link from 'next/link';
import { isMultiAnswer, isScored, type ActivityContent } from '@poetree/shared';
import type { Metadata } from 'next';
import type { QuestionRow, QuestionWithContext } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import {
  EditQuestionForm,
  QuestionControls,
} from '../../question-types/[id]/questions/forms';

export const metadata: Metadata = { title: 'Question · Poetree Admin' };

/**
 * One question, on its own.
 *
 * Under /questions rather than under the question type it belongs to, because
 * that is where somebody clicked from — and the sidebar marks its place by the
 * front of the address, so a question opened from Questions was lighting up
 * Question types and quietly saying you had gone somewhere else.
 *
 * Its neighbours stay one click away: a question is written against the ones
 * beside it, and "which one starts with C" only makes sense in a run of them.
 */
export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const question = await apiFetch<QuestionWithContext>(`/publication/questions/${id}`);
  const siblings = await apiFetch<QuestionRow[]>(
    `/publication/activities/${question.activity.id}/questions`,
  );

  const index = siblings.findIndex((row) => row.id === id);
  const scored = isScored(question.activity.type as ActivityContent['kind']);
  const tracing = question.activity.type === 'TRACING';
  const multi = isMultiAnswer(question.activity.type as ActivityContent['kind']);
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  const where = [question.book?.name, question.chapter?.name].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/questions"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All questions
          </Link>
        }
        title={index >= 0 ? `Question ${index + 1} of ${siblings.length}` : 'Question'}
        description={where || undefined}
        action={
          question.problem ? (
            <Pill tone="neutral">{question.problem}</Pill>
          ) : (
            <Pill tone="brand">Ready</Pill>
          )
        }
      />

      <div className="max-w-3xl space-y-4">
        <Card
          title={question.activity.title}
          description="The instruction this question is printed under."
          action={
            <Link
              href={`/publication/question-types/${question.activity.id}/questions`}
              className="text-sm font-medium text-navy-900 hover:underline"
            >
              All {siblings.length} on this page
            </Link>
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 border-b border-navy-950/[0.06] pb-4">
            <QuestionControls
              activityId={question.activity.id}
              question={siblings[index] ?? (question as unknown as QuestionRow)}
              previous={previous}
              next={next}
            />
          </div>

          <EditQuestionForm
            activityId={question.activity.id}
            question={siblings[index] ?? (question as unknown as QuestionRow)}
            scored={scored}
            tracing={tracing}
            multi={multi}
          />
        </Card>

        <div className="flex items-center justify-between gap-3">
          {previous ? (
            <Link
              href={`/publication/questions/${previous.id}`}
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
              href={`/publication/questions/${next.id}`}
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
