'use client';

import { useActionState } from 'react';
import type { QuestionRow } from '@poetree/shared';
import { Field, FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import {
  addQuestionAction,
  deleteQuestionAction,
  moveQuestionAction,
  updateQuestionAction,
  type QuestionState,
} from './actions';

/**
 * One option slot: a picture, an emoji or a word, and a radio for the right
 * answer.
 *
 * Four slots are always shown and the empty ones are ignored on save — an
 * author filling two is writing a two-choice question, which is what most
 * preschool pages are.
 */
function OptionSlot({
  index,
  option,
  scored,
}: {
  index: number;
  option?: QuestionRow['options'][number];
  scored: boolean;
}) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-navy-950/[0.08]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {index + 1}
        </span>
        {scored && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="radio"
              name="correct"
              value={index}
              defaultChecked={option?.isCorrect}
              className="h-3.5 w-3.5 border-navy-300 text-navy-900"
            />
            Right answer
          </label>
        )}
      </div>

      {option?.imageUrl && (
        <div className="mb-2 flex items-center gap-2">
          {/* Catalogue artwork through the proxy, so the cookie's token can be
              attached — the asset route is authenticated like everything else. */}
          <img
            src={`/attachments?kind=catalogue&id=${option.imageUrl.split('/').pop()}`}
            alt=""
            className="h-12 w-12 rounded-lg object-contain ring-1 ring-navy-950/10"
          />
          <span className="text-xs text-slate-500">Replace by choosing a new picture</span>
        </div>
      )}
      <input type="hidden" name={`option-${index}-fileId`} value={optionFileId(option)} />

      <div className="space-y-2">
        <Input type="file" name={`option-${index}-image`} accept="image/png,image/jpeg,image/webp" />
        <div className="flex gap-2">
          <Input
            name={`option-${index}-glyph`}
            defaultValue={option?.glyph ?? ''}
            placeholder="Emoji"
            className="w-24"
          />
          <Input
            name={`option-${index}-text`}
            defaultValue={option?.text ?? ''}
            placeholder="or a word"
          />
        </div>
      </div>
    </div>
  );
}

function optionFileId(option?: QuestionRow['options'][number]): string {
  const url = option?.imageUrl;
  return url ? (url.split('/').pop() ?? '') : '';
}

export function AddQuestionForm({
  activityId,
  scored,
  count,
}: {
  activityId: string;
  scored: boolean;
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

      <Field
        label="What the child has to do"
        required
        hint="Read aloud by the app. Written for the adult sitting beside them."
      >
        <Input name="say" required placeholder="Circle the apple" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Picture above the question" hint="Optional.">
          <Input type="file" name="prompt-image" accept="image/png,image/jpeg,image/webp" />
        </Field>
        <Field label="or an emoji" hint="Shown large, above the choices.">
          <Input name="promptGlyph" placeholder="🍎" />
        </Field>
      </div>

      {scored && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            What they choose between
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <OptionSlot key={index} index={index} scored={scored} />
            ))}
          </div>
        </div>
      )}

      <SubmitButton pendingLabel="Adding…">
        {count === 0 ? 'Add the first question' : 'Add another question'}
      </SubmitButton>
    </form>
  );
}

export function EditQuestionForm({
  activityId,
  question,
  scored,
}: {
  activityId: string;
  question: QuestionRow;
  scored: boolean;
}) {
  const [state, formAction] = useActionState<QuestionState, FormData>(
    updateQuestionAction.bind(null, activityId, question.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="What the child has to do" required>
        <Input name="say" required defaultValue={question.say} />
      </Field>

      <Field label="Emoji above the question">
        <Input name="promptGlyph" defaultValue={question.promptGlyph ?? ''} placeholder="🍎" />
      </Field>

      {scored && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <OptionSlot key={index} index={index} option={question.options[index]} scored={scored} />
          ))}
        </div>
      )}

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save this question
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
      <form action={deleteQuestionAction.bind(null, activityId, question.id)}>
        <button type="submit" className={CONTROL} title="Remove this question">
          Remove
        </button>
      </form>
    </div>
  );
}

const CONTROL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50';
