import Link from 'next/link';
import { isMultiAnswer, isScored, type ActivityContent } from '@poetree/shared';
import type { Metadata } from 'next';
import type { CatalogueActivity, QuestionRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AddQuestionForm } from '../../question-types/[id]/questions/forms';
import { allActivities } from '../all-activities';
import { TypePicker } from './type-picker';

export const metadata: Metadata = { title: 'Add a question · Poetree Admin' };

/**
 * Writing a question, without leaving Questions.
 *
 * A question cannot exist on its own — it is printed under an instruction, and
 * the instruction decides what the question even looks like: a tracing question
 * is a drawn path, a matching one is a list of choices. So the type is chosen
 * first, here, rather than by sending somebody to the Question types screen and
 * leaving them to find their way back.
 */
export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ activityId?: string }>;
}) {
  const { activityId } = await searchParams;

  const types = await allActivities();
  const chosen = activityId ? types.items.find((type) => type.id === activityId) : undefined;

  const [activity, existing] = chosen
    ? await Promise.all([
        apiFetch<CatalogueActivity>(`/publication/activities/${chosen.id}`),
        apiFetch<QuestionRow[]>(`/publication/activities/${chosen.id}/questions`),
      ])
    : [undefined, undefined];

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
        title="Add a question"
        description="Every question is printed under an instruction. Choose the one this belongs to."
      />

      <div className="max-w-3xl space-y-4">
        {types.items.length === 0 ? (
          <EmptyState
            title="No question types yet"
            description="A question is written under an instruction, so there has to be one to write it under."
          />
        ) : (
          <Card title="Which page is it on?">
            <TypePicker types={types.items} chosenId={chosen?.id} />
          </Card>
        )}

        {activity && existing && (
          <Card
            title={activity.title}
            description={
              activity.type === 'TRACING'
                ? 'Draw the path a child follows with their finger.'
                : isScored(activity.type as ActivityContent['kind'])
                  ? isMultiAnswer(activity.type as ActivityContent['kind'])
                    ? 'A picture, an emoji or a word on each choice. Tick every right one.'
                    : 'A picture, an emoji or a word on each choice. Tick the right one.'
                  : 'Something to look at. Nothing to get wrong.'
            }
            action={
              <Link
                href={`/publication/question-types/${activity.id}/questions`}
                className="text-sm font-medium text-navy-900 hover:underline"
              >
                {existing.length} already on this page
              </Link>
            }
          >
            <AddQuestionForm
              activityId={activity.id}
              scored={isScored(activity.type as ActivityContent['kind'])}
              tracing={activity.type === 'TRACING'}
              multi={isMultiAnswer(activity.type as ActivityContent['kind'])}
              count={existing.length}
            />
          </Card>
        )}

        {!chosen && types.items.length > 0 && (
          <Notice tone="info" title="Pick a page first">
            What a question looks like depends on it — a tracing question is a drawn path, a
            matching one is a list of choices.
          </Notice>
        )}
      </div>
    </>
  );
}
