'use client';

import { useActionState, useState } from 'react';
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
import { LiveSwitch } from '@/components/ui/live-switch';
import { Notice } from '@/components/ui/layout';
import {
  createBookAction,
  renameBookAction,
  setBookActiveAction,
  setBookCoverAction,
  setSchoolBooksAction,
  type BookState,
} from './actions';

/**
 * Chapters, named while the book is being made.
 *
 * A book with no contents page is a shelf of loose sheets, and adding them
 * afterwards meant saving, finding the book again, and typing into a different
 * screen. Three empty rows because that is roughly what a preschool workbook
 * has; blank ones are ignored, and more can be added on the book's own page.
 *
 * Each row takes its own film. The film belongs to the chapter — a chapter is
 * what a book is divided into, and one video standing in for everything between
 * two covers was never how a workbook is taught.
 */
function ChapterRows() {
  const [rows, setRows] = useState(3);

  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-navy-950/[0.06]">
      <p className="text-sm font-medium text-navy-950">Chapters</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Optional, and easy to change later. A film plays before that chapter&apos;s pages open.
      </p>

      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="w-14">
              <Input
                name="chapterNumber"
                type="number"
                min={0}
                max={999}
                placeholder="No."
                className="px-2 py-1.5 text-center text-sm"
                aria-label={`Number of chapter ${index + 1}`}
              />
            </span>
            <span className="w-52">
              <Input
                name="chapterName"
                placeholder={index === 0 ? 'Letters A to E' : 'Chapter name'}
                className="py-1.5 text-sm"
                aria-label={`Name of chapter ${index + 1}`}
              />
            </span>
            <span className="min-w-[12rem] flex-1">
              <Input
                name="chapterAnimation"
                placeholder="Film — https://youtu.be/… (optional)"
                className="py-1.5 text-sm"
                aria-label={`Film for chapter ${index + 1}`}
              />
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((count) => count + 1)}
        className="mt-3 rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        One more chapter
      </button>
    </div>
  );
}

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

      <ChapterRows />

      <Field
        label="Cover"
        hint="Tall reads best — the shelf draws it book-shaped, not square. It can be added or changed later."
      >
        <Input name="cover" type="file" accept="image/png,image/jpeg,image/webp" />
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

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/**
 * The cover: a picture, or the fact there isn't one.
 *
 * Thumbnail size in a list, and `large` on the book's own page, where the point
 * is to look at it rather than to tell one row from another.
 */
export function BookCover({ book, large }: { book: BookSummary; large?: boolean }) {
  const fileId = book.coverUrl?.split('/').pop();
  const size = large ? 'h-40 w-[7.5rem]' : 'h-14 w-11';

  return fileId ? (
    /* A plain img: one small picture from our own API, and next/image would
       want a loader configured for the host. */
    <img
      src={`/attachments?kind=catalogue&id=${fileId}`}
      alt=""
      className={`${size} shrink-0 rounded-lg object-cover ring-1 ring-navy-950/10`}
    />
  ) : (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-lg bg-slate-100 text-center text-[10px] text-slate-400 ring-1 ring-navy-950/10`}
    >
      no cover
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
        {/* Drawn at the size and shape the shelf draws it, so what you are
            looking at is what a child will see. */}
        <BookCover book={book} large />

        <div className="min-w-0 flex-1 space-y-3">
          <Input
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={`Cover for ${book.name}`}
          />

          <SubmitButton variant="secondary" pendingLabel="Uploading…">
            {hasCover ? 'Replace' : 'Upload'}
          </SubmitButton>

          <p className="text-xs text-slate-500">
            Tall reads best — the shelf draws it book-shaped, not square.
            {hasCover && ' Submit with nothing chosen to take it off again.'}
          </p>
        </div>
      </div>
    </form>
  );
}

/** Whether schools may have this book at all. */
export function BookLiveSwitch({ book }: { book: BookSummary }) {
  return (
    <LiveSwitch
      on={book.isActive}
      action={setBookActiveAction.bind(null, book.id, !book.isActive)}
      label={book.isActive ? `Withdraw ${book.name}` : `Put ${book.name} back on sale`}
      onTitle="On sale"
      offTitle="Withdrawn"
      onNote="Schools that have this book can use it, and it can be sold to more."
      offNote="Hidden from every school, including any that already had it. Nothing children have done is lost — switching it back on returns them exactly where they were."
      blockedReason={
        book.schoolCount > 0
          ? `${book.schoolCount} ${book.schoolCount === 1 ? 'school has' : 'schools have'} this book switched on.`
          : undefined
      }
    />
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
