'use client';

import { useActionState } from 'react';
import type { QuestionRow } from '@poetree/shared';
import { FormError, FormSuccess, SubmitButton } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import {
  addQuestionAction,
  deleteQuestionAction,
  moveQuestionAction,
  updateQuestionAction,
  type QuestionState,
} from './actions';
import { QuestionFields } from './editors';

/**
 * A new question on a page.
 *
 * What it asks for depends on how the page is played — options to tick, pairs
 * to join, baskets to sort into, a number to colour — and `QuestionFields`
 * lays that out from the activity's type.
 */
export function AddQuestionForm({
  activityId,
  type,
  count,
}: {
  activityId: string;
  /** The activity's type: how a child plays every question on the page. */
  type: string;
  count: number;
}) {
  const [state, formAction] = useActionState<QuestionState, FormData>(
    addQuestionAction.bind(null, activityId),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <QuestionFields type={type} />

      <SubmitButton pendingLabel="Adding…">
        {count === 0 ? 'Add the first activity' : 'Add another activity'}
      </SubmitButton>
    </form>
  );
}

export function EditQuestionForm({
  activityId,
  question,
  type,
}: {
  activityId: string;
  question: QuestionRow;
  type: string;
}) {
  const [state, formAction] = useActionState<QuestionState, FormData>(
    updateQuestionAction.bind(null, activityId, question.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <QuestionFields type={type} question={question} />

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save this activity
      </SubmitButton>
    </form>
  );
}

export function QuestionControls({
  activityId,
  question,
  previous,
  next,
}: {
  activityId: string;
  question: QuestionRow;
  previous?: QuestionRow;
  next?: QuestionRow;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Swapped with the neighbour rather than nudged by a number: two
          questions added a second apart can share a sort order, and nudging
          would leave the page in an order nobody chose. */}
      {previous && (
        <form action={moveQuestionAction.bind(null, activityId, question.id, previous.id)}>
          <button type="submit" className={CONTROL} title="Move up">
            ↑
          </button>
        </form>
      )}
      {next && (
        <form action={moveQuestionAction.bind(null, activityId, question.id, next.id)}>
          <button type="submit" className={CONTROL} title="Move down">
            ↓
          </button>
        </form>
      )}
      <ConfirmButton
        action={deleteQuestionAction.bind(null, activityId, question.id)}
        label="Remove"
        title="Remove this activity?"
        body={
          question.say
            ? `“${question.say}” goes, along with its choices, its picture and any strokes drawn for it. There is no undo.`
            : 'This activity goes, along with its choices, its picture and any strokes drawn for it. There is no undo.'
        }
        confirmLabel="Remove the activity"
      />
    </div>
  );
}

const CONTROL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50';
