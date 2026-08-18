'use client';

import { useActionState, useState } from 'react';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, type CatalogueActivity } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from '@/components/ui/form';
import { LiveSwitch } from '@/components/ui/live-switch';
import {
  createActivityAction,
  setActivityActiveAction,
  updateActivityAction,
  type ActivityState,
} from './actions';

interface Option {
  id: string;
  name: string;
}

interface BookOption {
  id: string;
  name: string;
  classLevel: { name: string };
}

interface ChapterOption {
  id: string;
  name: string;
  bookId: string;
  bookName: string;
}

/**
 * Where this page lives: the book, and the chapter within it.
 *
 * The chapter list shows its book's name against every option rather than
 * filtering as the book changes — a server-rendered form has no way to react
 * to the other field, and a chapter from the wrong book is refused on save
 * with a message that says so.
 */
/**
 * Which books this page is in.
 *
 * A single dropdown, because a page belonged to one book. The same "trace the
 * letter A" is a page of the phonics book and of Nursery English, and the only
 * way to say so was to write it twice — two rows to fix when the wording
 * changed, and a child's practice split across two of them.
 *
 * Chapters are not here. A chapter belongs to one book, so it cannot mean
 * anything for a page in three; it is set on the book's own contents page,
 * where the book is known.
 */
function BookPicker({
  books,
  selected,
  everyBook,
}: {
  books: BookOption[];
  selected?: string[];
  everyBook?: boolean;
}) {
  const [all, setAll] = useState(everyBook ?? false);
  const chosen = new Set(selected ?? []);

  // Grouped by standard, which is how a publisher thinks about their shelf.
  const byLevel = new Map<string, BookOption[]>();
  for (const book of books) {
    const key = book.classLevel.name;
    byLevel.set(key, [...(byLevel.get(key) ?? []), book]);
  }

  return (
    <Field
      label="Books"
      hint="A question type in no book reaches nobody — schools are given books, not loose pages."
    >
      <label className="mb-3 flex items-start gap-2.5 rounded-xl bg-navy-50/60 p-3 text-sm text-navy-950 ring-1 ring-navy-950/[0.06]">
        <input
          type="checkbox"
          name="allBooks"
          value="true"
          checked={all}
          onChange={(event) => setAll(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-navy-300 text-navy-900"
        />
        <span>
          <span className="font-medium">Every book</span>
          <span className="mt-0.5 block text-xs text-slate-600">
            Including books added later. A warm-up page that belongs everywhere stays in the book
            written next March without anybody coming back for it.
          </span>
        </span>
      </label>

      {!all && (
        <div className="space-y-3">
          {books.length === 0 ? (
            <p className="text-sm text-slate-500">No books yet. Add one first.</p>
          ) : (
            [...byLevel.entries()].map(([level, group]) => (
              <div key={level}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {level}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.map((book) => (
                    <label
                      key={book.id}
                      className="flex items-center gap-2.5 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="bookIds"
                        value={book.id}
                        defaultChecked={chosen.has(book.id)}
                        className="h-4 w-4 rounded border-navy-300 text-navy-900"
                      />
                      {book.name}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Field>
  );
}

export function NewActivityForm({
  skills,
  classLevels,
  books,
}: {
  skills: Option[];
  classLevels: Option[];
  books: BookOption[];
}) {
  const [state, formAction] = useActionState<ActivityState, FormData>(createActivityAction, {});
  const [type, setType] = useState<string>('SINGLE_CHOICE');

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="Instruction" required hint="Exactly as it reads on the page of the book.">
        <Input name="title" required placeholder="Circle the correct letter" />
      </Field>

      <FieldSet>
        <Field
          label="Played as"
          required
          hint="How a child answers it. Fixed once saved, because it decides how every attempt is scored."
        >
          <Select
            name="type"
            required
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {ACTIVITY_TYPES.map((option) => (
              <option key={option} value={option}>
                {ACTIVITY_TYPE_LABELS[option].label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-slate-500">
            {ACTIVITY_TYPE_LABELS[type as keyof typeof ACTIVITY_TYPE_LABELS]?.hint}
          </p>
        </Field>
        <Field label="Skill" required hint="What mastery this counts towards.">
          <Select name="skillId" required>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      <BookPicker books={books} />

      <Field label="Class level" hint="Leave blank to offer it to every level.">
        <Select name="classLevelId" defaultValue="">
          <option value="">Every level</option>
          {classLevels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </Select>
      </Field>

      {/* No content here any more. A question type is the instruction at the
          top of a page; its questions are written on their own screen, one at a
          time, with pictures and a stroke pad — which is where somebody who has
          never seen JSON can actually write them. */}
      <SubmitButton pendingLabel="Saving…">Add question type</SubmitButton>
    </form>
  );
}

export function EditActivityForm({
  activity,
  content,
  skills,
  classLevels,
  books,
  chapters,
}: {
  activity: CatalogueActivity;
  content: string;
  skills: Option[];
  classLevels: Option[];
  books: BookOption[];
  chapters: ChapterOption[];
}) {
  const [state, formAction] = useActionState<ActivityState, FormData>(updateActivityAction, {});
  const [draft, setDraft] = useState(content);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={activity.id} />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Title" required>
          <Input name="title" required defaultValue={activity.title} />
        </Field>
        <Field label="Code" hint="Fixed — a workbook already points at it.">
          <Input defaultValue={activity.code} disabled className="font-mono" />
        </Field>
      </FieldSet>

      <FieldSet>
        <Field label="Skill" required>
          <Select name="skillId" required defaultValue={activity.skill.id}>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class level">
          <Select name="classLevelId" defaultValue={activity.classLevelId ?? ''}>
            <option value="">Every level</option>
            {classLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      <BookPicker
        books={books}
        selected={activity.books.map((book) => book.id)}
        everyBook={activity.allBooks}
      />

      {/* Filing into a chapter needs a book to file it in, and a chapter
          belongs to one book. Said here rather than silently dropping the
          field, because the contents page is where somebody looks for it. */}
      {activity.books.length === 1 && (
        <Field label="Chapter" hint="Where it sits in that book's contents page.">
          <Select name="chapterId" defaultValue={activity.chapter?.id ?? ''}>
            <option value="">Not in a chapter</option>
            {chapters
              .filter((option) => option.bookId === activity.books[0]!.id)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
          </Select>
        </Field>
      )}

      <RawContentField value={draft} onChange={setDraft} />

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/**
 * The stored content, for an activity old enough to still have some.
 *
 * Content is composed from question rows now. This remains only for the
 * activities written before that — hidden behind a disclosure, because it is
 * the one thing on these screens that assumes the reader knows what JSON is,
 * and for everything authored today it is empty and irrelevant.
 */
function RawContentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const items = countItems(value);
  const empty = value.trim() === '' || value.trim() === '{}';

  if (empty) return null;

  return (
    <details className="rounded-xl bg-slate-50 p-4 ring-1 ring-navy-950/[0.06]">
      <summary className="cursor-pointer text-sm font-medium text-navy-950">
        Stored content
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Written before questions had a screen of their own. Editing the questions
        replaces this.
      </p>
      <Textarea
        name="content"
        rows={14}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 font-mono text-xs"
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {items === null ? 'Not valid JSON yet.' : `${items} ${items === 1 ? 'item' : 'items'}.`}
      </p>
    </details>
  );
}

function countItems(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    return Array.isArray(parsed.items) ? parsed.items.length : null;
  } catch {
    return null;
  }
}

/**
 * Whether children are given this page at all. A flag, never a delete: what
 * they have already answered on it has to keep meaning something.
 */
export function ActivityLiveSwitch({ activity }: { activity: CatalogueActivity }) {
  return (
    <LiveSwitch
      on={activity.isActive}
      action={setActivityActiveAction.bind(null, activity.id, !activity.isActive)}
      label={activity.isActive ? `Withdraw ${activity.title}` : `Bring back ${activity.title}`}
      onTitle="In the book"
      offTitle="Withdrawn"
      onNote="Children with this book are given this page."
      offNote="No child is given this page any more. Every answer already recorded against it is kept, and bringing it back returns it exactly as it was."
      blockedReason={
        activity.attemptCount > 0
          ? `Answered ${activity.attemptCount} ${
              activity.attemptCount === 1 ? 'time' : 'times'
            } so far, across every school.`
          : undefined
      }
    />
  );
}
