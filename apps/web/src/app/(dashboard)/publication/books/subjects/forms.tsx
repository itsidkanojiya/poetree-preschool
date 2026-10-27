'use client';

import { useActionState } from 'react';
import { BOOK_SUBJECT_ICONS, type BookSubjectSummary } from '@poetree/shared';
import { FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  createSubjectAction,
  setSubjectActiveAction,
  setSubjectPictureAction,
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
    <div
      className={`flex flex-wrap items-center gap-2 py-2.5 transition-opacity ${
        subject.isActive ? '' : 'opacity-60'
      }`}
    >
      <SubjectPicture subject={subject} />

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
      <SubjectSwitch subject={subject} />
    </div>
  );
}

/**
 * On or off, as a switch that shows which it is: green and "Shown" while
 * children see the subject, grey and "Hidden" when it is off. One click
 * changes it. A submit button drawn as a switch, so there is no state here to
 * fall out of step with the school's.
 */
function SubjectSwitch({ subject }: { subject: BookSubjectSummary }) {
  const on = subject.isActive;
  return (
    <form
      action={setSubjectActiveAction.bind(null, subject.id, !on)}
      className="ml-auto flex items-center gap-2.5"
    >
      <span
        className={`w-14 text-right text-xs font-medium ${on ? 'text-leaf-800' : 'text-slate-500'}`}
      >
        {on ? 'Shown' : 'Hidden'}
      </span>
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={`Show ${subject.name} in the app`}
        title={on ? `Hide ${subject.name} from the app` : `Show ${subject.name} in the app`}
        className={`relative h-7 w-12 shrink-0 rounded-full ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 ${
          on
            ? 'bg-leaf-600 ring-leaf-600 hover:bg-leaf-700'
            : 'bg-slate-200 ring-navy-950/10 hover:bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            on ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </form>
  );
}

/**
 * The subject's picture, as the app's tile shows it: click the square to choose
 * one, and it is uploaded at once. Without one the app draws the icon chosen
 * beside it, so a subject nobody has drawn yet still has a proper tile.
 */
function SubjectPicture({ subject }: { subject: BookSubjectSummary }) {
  const [state, formAction, pending] = useActionState<SubjectState, FormData>(
    setSubjectPictureAction.bind(null, subject.id),
    {},
  );
  const fileId = subject.pictureUrl?.split('/').pop();

  return (
    <form action={formAction} className="relative shrink-0">
      <label
        className="group relative grid h-12 w-12 cursor-pointer place-items-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-navy-950/10"
        title={fileId ? 'Change the picture' : 'Add a picture'}
      >
        {fileId ? (
          /* A plain img, like a book's cover: one small picture from our own
             API, through the proxy that carries the token. */
          <img
            src={`/attachments?kind=catalogue&id=${fileId}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-center text-[10px] leading-tight text-slate-400">
            Add
            <br />
            picture
          </span>
        )}
        <span
          className={`absolute inset-0 place-items-center bg-navy-950/45 text-[10px] font-medium text-white ${
            pending ? 'grid' : 'hidden group-hover:grid'
          }`}
        >
          {pending ? 'Saving…' : fileId ? 'Change' : 'Add'}
        </span>
        <input
          type="file"
          name="picture"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={pending}
          aria-label={`Picture for ${subject.name}`}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        />
      </label>

      {fileId && !pending && (
        <button
          type="submit"
          name="remove"
          value="1"
          title="Remove the picture"
          aria-label={`Remove the picture of ${subject.name}`}
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-xs leading-none text-slate-500 shadow ring-1 ring-navy-950/10 hover:text-rose-600"
        >
          ×
        </button>
      )}

      <Toast message={state.error} tone="bad" />
      <Toast message={state.success} />
    </form>
  );
}
