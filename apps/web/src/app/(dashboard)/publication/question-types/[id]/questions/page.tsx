import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity, QuestionRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft, IconPlus } from '@/components/icons';
import { FOCUS } from '../../../readiness';
import { AddQuestionForm, EditQuestionForm, QuestionControls } from './forms';
import { editorDescription } from './editors/kinds';

export const metadata: Metadata = { title: 'Activities · Poetree Admin' };

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

  const broken = questions.filter((question) => question.problem !== null);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/publication/question-types/${id}`}
            className={`inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            The activity type
          </Link>
        }
        title={activity.title}
        description={`${questions.length} ${questions.length === 1 ? 'activity' : 'activities'}${
          activity.book ? ` · ${activity.book.name}` : ''
        }${activity.chapter ? ` › ${activity.chapter.name}` : ''}`}
        action={
          <a
            href="#add"
            className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
          >
            <IconPlus size={17} aria-hidden="true" />
            Add an activity
          </a>
        }
      />

      {broken.length > 0 && (
        <div className="mb-5">
          <Notice tone="warning">
            {broken.length === 1 ? 'One activity is' : `${broken.length} activities are`} not being
            shown to children: {broken.map((question) => question.problem).join('; ')}.
          </Notice>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="mb-6 text-sm text-amber-700">
          Nothing written yet, so this page reaches nobody. Add the first activity below.
        </p>
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

              <EditQuestionForm activityId={id} question={question} type={activity.type} />
            </Card>
          ))}
        </div>
      )}

      {/* The jump target for "Add an activity" — at the end, where the next one goes. */}
      <div id="add" className="max-w-3xl scroll-mt-6">
        <Card title="Add an activity" description={editorDescription(activity.type)}>
          <AddQuestionForm activityId={id} type={activity.type} count={questions.length} />
        </Card>
      </div>
    </>
  );
}
