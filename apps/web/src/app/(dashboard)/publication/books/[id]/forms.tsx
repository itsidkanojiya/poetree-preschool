'use client';

import { useActionState } from 'react';
import type { ChapterSummary } from '@poetree/shared';
import { Field, FieldSet, FormError, FormSuccess, Input, SubmitButton } from '@/components/ui/form';
import {
  createChapterAction,
  deleteChapterAction,
  renameChapterAction,
  type ChapterState,
} from './actions';

export function NewChapterForm({ bookId }: { bookId: string }) {
  const [state, formAction] = useActionState<ChapterState, FormData>(
    createChapterAction.bind(null, bookId),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Chapter" required hint="As it reads in the contents page.">
          <Input name="name" required placeholder="Letters A to E" />
        </Field>
        <Field
          label="Number"
          hint="What is printed on the page. Leave blank if the book has none."
        >
          <Input name="number" type="number" min={0} max={999} placeholder="1" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Adding…">Add chapter</SubmitButton>
    </form>
  );
}

/** Renaming and renumbering in place — what is actually done often. */
export function ChapterRow({ chapter }: { chapter: ChapterSummary }) {
  const [state, formAction] = useActionState<ChapterState, FormData>(
    renameChapterAction.bind(null, chapter.bookId, chapter.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Input
        name="number"
        type="number"
        defaultValue={chapter.number ?? ''}
        className="h-9 w-16 text-sm"
        aria-label={`Number of ${chapter.name}`}
      />
      <Input
        name="name"
        defaultValue={chapter.name}
        className="h-9 w-56 text-sm"
        aria-label={`Name of ${chapter.name}`}
      />
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Save
      </button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

export function DeleteChapterButton({ chapter }: { chapter: ChapterSummary }) {
  const action = deleteChapterAction.bind(null, chapter.bookId, chapter.id);

  return (
    <form action={action}>
      <button
        type="submit"
        // Refused server-side while pages are filed under it, so the count is
        // shown rather than the button hidden.
        title={
          chapter.activityCount > 0
            ? `${chapter.activityCount} question types are in this chapter`
            : undefined
        }
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Remove
      </button>
    </form>
  );
}
