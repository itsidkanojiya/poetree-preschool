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
    <form action={formAction} className="flex flex-wrap items-center gap-2">
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
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
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
