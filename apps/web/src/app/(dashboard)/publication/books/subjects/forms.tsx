'use client';

import { useActionState } from 'react';
import { BOOK_SUBJECT_ICONS, type BookSubjectSummary } from '@poetree/shared';
import { FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  createSubjectAction,
  setSubjectActiveAction,
  updateSubjectAction,
  type SubjectState,
} from './actions';

/** What each picture key looks like, in words the publisher would choose by. */
const ICON_LABELS: Record<(typeof BOOK_SUBJECT_ICONS)[number], string> = {
  abc: 'Letters (ABC)',
  numbers: 'Numbers (123)',
  globe: 'Globe',
  hindi: 'Hindi letters',
  gujarati: 'Gujarati letters',
  bulb: 'Light bulb',
  music: 'Music note',
  phonics: 'Speaker',
  book: 'Book',
  stories: 'Lion and elephant (stories)',
  shapes: 'Shapes',
  festivals: 'Festivals and seasons',
  awareness: 'World landmarks',
  abc_blocks: 'ABC blocks',
  number_blocks: '123 blocks',
  storybook: 'Open storybook',
};

function IconSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Select
      name="icon"
      defaultValue={defaultValue ?? 'book'}
      className="py-1.5 text-sm"
      aria-label="Picture"
    >
      {BOOK_SUBJECT_ICONS.map((icon) => (
        <option key={icon} value={icon}>
          {ICON_LABELS[icon]}
        </option>
      ))}
    </Select>
  );
}

export function NewSubjectForm() {
  const [state, formAction] = useActionState<SubjectState, FormData>(createSubjectAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-56">
          <Input
            name="name"
            required
            placeholder="Gujarati"
            className="py-1.5 text-sm"
            aria-label="Subject name"
          />
        </span>
        <span className="w-48">
          <IconSelect />
        </span>
        <SubmitButton pendingLabel="Adding…">Add subject</SubmitButton>
      </div>
      <FormError message={state.error} />
      <Toast message={state.success} />
    </form>
  );
}

/** One subject, edited where it is listed. */
export function SubjectRow({ subject }: { subject: BookSubjectSummary }) {
  const [state, formAction] = useActionState<SubjectState, FormData>(
    updateSubjectAction.bind(null, subject.id),
    {},
  );

  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5">
      <form action={formAction} className="flex flex-1 flex-wrap items-center gap-2">
        <span className="w-56">
          <Input
            name="name"
            defaultValue={subject.name}
            className="py-1.5 text-sm"
            aria-label={`Name of ${subject.name}`}
          />
        </span>
        <span className="w-48">
          <IconSelect defaultValue={subject.icon} />
        </span>
        <span className="text-xs text-slate-500">
          {subject.bookCount} {subject.bookCount === 1 ? 'book' : 'books'}
        </span>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
        {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
        <Toast message={state.success} />
      </form>

      {/* Switched off, never deleted: its books show under "More books" until
          they are filed somewhere else. */}
      <form action={setSubjectActiveAction.bind(null, subject.id, !subject.isActive)}>
        <button
          type="submit"
          className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
            subject.isActive
              ? 'text-slate-600 ring-navy-200 hover:bg-navy-50'
              : 'text-leaf-800 ring-leaf-300 hover:bg-leaf-50'
          }`}
        >
          {subject.isActive ? 'Switch off' : 'Switch on'}
        </button>
      </form>
    </div>
  );
}
