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

/**
 * The book itself: what it is called, and the film that opens it.
 *
 * One form with a real Save rather than two inputs wedged into a table cell.
 * The standard and the code are not editable on purpose — a book that changed
 * year or code mid-term would move under every school already using it.
 */
export function BookDetailsForm({ book }: { book: BookSummary }) {
  const [state, formAction] = useActionState<BookState, FormData>(
    renameBookAction.bind(null, book.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Book" required hint="As it reads on the cover.">
          <Input name="name" required defaultValue={book.name} />
        </Field>
        <Field label="Standard" hint="Chosen when the book was added, and fixed.">
          <Input value={book.classLevel.name} disabled readOnly />
        </Field>
      </FieldSet>

      <Field
        label="Animation"
        hint="A YouTube link. The child watches it once and the book opens. Leave it blank and the book is open from the start."
      >
        <Input
          name="animationUrl"
          defaultValue={book.animation?.url ?? ''}
          placeholder="https://youtu.be/…"
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/** The cover as the list draws it: a picture, or the fact there isn't one. */
export function BookCover({ book }: { book: BookSummary }) {
  const fileId = book.coverUrl?.split('/').pop();

  return fileId ? (
    /* A plain img: one small picture from our own API, and next/image would
       want a loader configured for the host. */
    <img
      src={`/attachments?kind=catalogue&id=${fileId}`}
      alt=""
      className="h-14 w-11 shrink-0 rounded-md object-cover ring-1 ring-navy-950/10"
    />
  ) : (
    <span className="grid h-14 w-11 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] text-slate-400 ring-1 ring-navy-950/10">
      none
    </span>
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

  const hasCover = Boolean(book.coverUrl);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <div className="flex items-start gap-4">
        <BookCover book={book} />

        <div className="min-w-0 flex-1 space-y-3">
          <Field
            label={hasCover ? 'Replace the cover' : 'Cover'}
            hint="A tall picture reads best — the shelf draws this book-shaped, not square."
          >
            <Input
              name="cover"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Cover for ${book.name}`}
            />
          </Field>

          <SubmitButton variant="secondary" pendingLabel="Uploading…">
            {hasCover ? 'Replace cover' : 'Upload cover'}
          </SubmitButton>

          {hasCover && (
            <p className="text-xs text-slate-500">
              Submitting with no file chosen takes the cover off, and the shelf goes back to a
              coloured card carrying the name.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * Whether schools may have this book at all.
 *
 * Was a button reading "Retire", which named what would happen to the button
 * rather than what is true of the book. It looked identical either way, so the
 * only way to know the state was to read the word on it and invert it. A switch
 * shows the state before anybody touches it.
 */
export function BookLiveSwitch({ book }: { book: BookSummary }) {
  const action = setBookActiveAction.bind(null, book.id, !book.isActive);

  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-950">
          {book.isActive ? 'On sale' : 'Withdrawn'}
        </p>
        <p className="mt-0.5 max-w-md text-xs text-slate-500">
          {book.isActive
            ? 'Schools that have this book can use it, and it can be sold to more.'
            : 'Hidden from every school, including any that already had it. Nothing children have done is lost — switching it back on returns them exactly where they were.'}
        </p>
      </div>

      {/* A submit button drawn as a switch: no client state to hold in step
          with the server, and it still works before React has loaded. */}
      <button
        type="submit"
        role="switch"
        aria-checked={book.isActive}
        aria-label={book.isActive ? `Withdraw ${book.name}` : `Put ${book.name} back on sale`}
        className={`relative h-7 w-12 shrink-0 rounded-full ring-1 transition-colors ${
          book.isActive
            ? 'bg-navy-900 ring-navy-900 hover:bg-navy-800'
            : 'bg-slate-200 ring-navy-950/10 hover:bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            book.isActive ? 'left-6' : 'left-1'
          }`}
        />
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
