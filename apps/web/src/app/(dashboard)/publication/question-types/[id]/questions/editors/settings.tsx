'use client';

import type { QuestionRow } from '@poetree/shared';
import { Field, Input, Textarea } from '@/components/ui/form';

/**
 * The types written as a few typed fields rather than a set of slots: Count
 * and Colour, Fill the Gap, Find the Letter, and the words of a rhyme or story.
 * Each field is one of the question's settings, read back by name.
 */

/** Count and Colour: how many to colour, and how many to show. */
export function CountEditor({ question }: { question?: QuestionRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Number to colour" required hint="1 to 20. Shown big, in the tracing numbers.">
        <Input
          name="target"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={question?.settings.target ?? ''}
          placeholder="11"
        />
      </Field>
      <Field
        label="How many to show"
        hint="Leave empty for a few more than the number. 20 at most."
      >
        <Input
          name="shown"
          type="number"
          min={1}
          max={20}
          defaultValue={question?.settings.shown ?? ''}
          placeholder="20"
        />
      </Field>
    </div>
  );
}

/** Fill the Gap: the row with its gaps in brackets, and any wrong tiles. */
export function GapEditor({ question }: { question?: QuestionRow }) {
  return (
    <div className="grid gap-3">
      <Field
        label="The row"
        required
        hint="Spaces between, gaps in brackets: 1 2 [3] 4 [5] · A B [C] D · [a] p p l e"
      >
        <Input
          name="row"
          required
          defaultValue={question?.settings.row ?? ''}
          placeholder="1 2 [3] 4 [5]"
        />
      </Field>
      <Field label="Wrong tiles" hint="Optional, e.g. 6 9. Chosen for you when empty.">
        <Input name="extras" defaultValue={question?.settings.extras ?? ''} placeholder="6 9" />
      </Field>
    </div>
  );
}

/** Find the Letter: what to find, and everything it is hidden among. */
export function HuntEditor({ question }: { question?: QuestionRow }) {
  return (
    <div className="grid gap-3">
      <Field label="What to find" required hint="With spaces between, e.g. D d, or 7.">
        <Input
          name="targets"
          required
          defaultValue={question?.settings.targets ?? ''}
          placeholder="D d"
        />
      </Field>
      <Field
        label="Everything in the grid"
        required
        hint="Up to 30, e.g. D A d D d E. With no spaces, each letter is one; numbers like 10 need spaces. Six or fewer show as a train."
      >
        <Textarea
          name="grid"
          required
          rows={3}
          defaultValue={question?.settings.grid ?? ''}
          placeholder="D A d D d E D O D A Z d C D d"
        />
      </Field>
    </div>
  );
}

/** A rhyme or a story: the words, a line to a line. */
export function VerseEditor({ type, question }: { type: string; question?: QuestionRow }) {
  return (
    <Field
      label={type === 'STORY' ? 'The story' : 'The words'}
      required
      hint="A line to a line. The app reads them in turn and lights up the one it is reading."
    >
      <Textarea
        name="lines"
        required
        rows={8}
        defaultValue={question?.settings.lines ?? ''}
        placeholder={
          type === 'STORY'
            ? 'Once upon a time there was a crow, and he was very thirsty.'
            : 'Twinkle, twinkle, little star,\nHow I wonder what you are.'
        }
      />
    </Field>
  );
}
