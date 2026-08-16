'use client';

import { useActionState } from 'react';
import type { BookSummary, SchoolBookRow, StandardSummary } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
} from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import {
  createBookAction,
  renameBookAction,
  setBookActiveAction,
  setBookCoverAction,
  setSchoolBooksAction,
  type BookState,
} from './actions';

export function NewBookForm({ standards }: { standards: StandardSummary[] }) {
  const [state, formAction] = useActionState<BookState, FormData>(createBookAction, {});

  if (standards.length === 0) {
    return (
      <Notice tone="info" title="Add a standard first">
        A book belongs to one year, so there has to be a year to put it in.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Book" required hint="As it reads on the cover.">
          <Input name="name" required placeholder="EVS Book" />
        </Field>
        <Field label="Standard" required>
          <Select name="classLevelId" required defaultValue={standards[0]?.id}>
            {standards.map((standard) => (
              <option key={standard.id} value={standard.id}>
                {standard.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      <Field label="Code" required hint="Fixed once saved. How an import file refers to it.">
        <Input
          name="code"
          required
          placeholder="NUR_EVS"
          pattern="[A-Za-z][A-Za-z0-9_]{1,39}"
          className="font-mono uppercase"
        />
      </Field>

      <Field
        label="Animation"
        hint="A YouTube link. The child watches this once and the book's activities open. Leave blank and they are open from the start."
      >
        <Input name="animationUrl" placeholder="https://youtu.be/…" />
      </Field>

      <SubmitButton pendingLabel="Adding…">Add book</SubmitButton>
    </form>
  );
}

export function BookNameForm({ book }: { book: BookSummary }) {
  const [state, formAction] = useActionState<BookState, FormData>(
    renameBookAction.bind(null, book.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          defaultValue={book.name}
          className="h-9 w-52 text-sm"
          aria-label={`Name of ${book.name}`}
        />
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
        >
          Save
        </button>
      </div>
      <Input
        name="animationUrl"
        defaultValue={book.animation?.url ?? ''}
        placeholder="YouTube link — children watch this before the activities open"
        className="h-8 w-full text-xs"
        aria-label={`Animation for ${book.name}`}
      />
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

/**
 * The cover, which is what a child actually recognises on the shelf.
 *
 * Shown through the proxy rather than straight from the API: the access token
 * lives in an httpOnly cookie, so no plain img can carry it.
 */
export function BookCoverForm({ book }: { book: BookSummary }) {
  const [state, formAction] = useActionState<BookState, FormData>(
    setBookCoverAction.bind(null, book.id),
    {},
  );

  const fileId = book.coverUrl?.split('/').pop();

  return (
    <form action={formAction} className="flex items-center gap-2">
      {fileId ? (
        /* A plain img: one small picture from our own API, and next/image
           would want a loader configured for the host. */
        <img
          src={`/attachments?kind=catalogue&id=${fileId}`}
          alt=""
          className="h-14 w-11 shrink-0 rounded-md object-cover ring-1 ring-navy-950/10"
        />
      ) : (
        <span className="grid h-14 w-11 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] text-slate-400 ring-1 ring-navy-950/10">
          none
        </span>
      )}

      <span className="min-w-0">
        <Input
          name="cover"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="h-8 w-44 text-xs"
          aria-label={`Cover for ${book.name}`}
        />
        <button
          type="submit"
          className="mt-1 rounded-lg px-2 py-0.5 text-[11px] font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
        >
          {fileId ? 'Replace' : 'Upload'}
        </button>
        {state.error && <span className="ml-1 text-[11px] text-rose-600">{state.error}</span>}
      </span>
    </form>
  );
}

export function RetireBookButton({ book }: { book: BookSummary }) {
  const action = setBookActiveAction.bind(null, book.id, !book.isActive);

  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        {book.isActive ? 'Retire' : 'Bring back'}
      </button>
    </form>
  );
}

/**
 * What this school bought.
 *
 * Grouped by standard, because that is how somebody thinks about it: a school
 * teaching only Nursery and Junior KG should not have to read past four years
 * of books to find theirs.
 */
export function SchoolBooksPanel({
  schoolId,
  rows,
}: {
  schoolId: string;
  rows: SchoolBookRow[];
}) {
  const [state, formAction] = useActionState<BookState, FormData>(
    setSchoolBooksAction.bind(
      null,
      schoolId,
      rows.map((row) => row.bookId),
    ),
    {},
  );

  if (rows.length === 0) {
    return (
      <Notice tone="info" title="No books yet">
        Add books under Books, then choose which of them this school has.
      </Notice>
    );
  }

  const byStandard = new Map<string, SchoolBookRow[]>();
  for (const row of rows) {
    const key = row.classLevel.name;
    byStandard.set(key, [...(byStandard.get(key) ?? []), row]);
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {[...byStandard.entries()].map(([standard, books]) => (
        <div key={standard}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {standard}
          </p>
          <div className="space-y-2">
            {books.map((book) => (
              <label key={book.bookId} className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="books"
                  value={book.bookId}
                  defaultChecked={book.enabled}
                  className="h-4 w-4 rounded border-navy-300 text-navy-900"
                />
                {book.name}
                {/* Switching on an empty book gives a family a shelf with
                    nothing on it, which reads as broken rather than as unsold. */}
                {!book.hasContent && (
                  <span className="text-xs text-amber-700">nothing in it yet</span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save which books they have
      </SubmitButton>
    </form>
  );
}
