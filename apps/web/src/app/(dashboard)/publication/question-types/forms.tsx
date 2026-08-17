'use client';

import { useActionState, useState } from 'react';
import { ACTIVITY_TYPES, type CatalogueActivity } from '@poetree/shared';
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
function PlacementFields({
  books,
  chapters,
  book,
  chapter,
}: {
  books: BookOption[];
  chapters: ChapterOption[];
  book?: string | null;
  chapter?: string | null;
}) {
  return (
    <FieldSet>
      <Field
        label="Book"
        hint="A question type with no book reaches nobody — schools are given books."
      >
        <Select name="bookId" defaultValue={book ?? ''}>
          <option value="">Not in a book yet</option>
          {books.map((option) => (
            <option key={option.id} value={option.id}>
              {option.classLevel.name} · {option.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Chapter" hint="Optional. Must belong to the book above.">
        <Select name="chapterId" defaultValue={chapter ?? ''}>
          <option value="">Not in a chapter</option>
          {chapters.map((option) => (
            <option key={option.id} value={option.id}>
              {option.bookName} · {option.name}
            </option>
          ))}
        </Select>
      </Field>
    </FieldSet>
  );
}

/**
 * A starting point for each type, so nobody has to remember the shape.
 *
 * These are real, playable examples rather than empty scaffolding — an author
 * can change the words and have something a child can use.
 */
const TEMPLATES: Record<string, string> = {
  TRACING: JSON.stringify(
    {
      kind: 'TRACING',
      items: [
        {
          glyph: 'A',
          say: 'Trace the letter A',
          strokes: [
            [
              { x: 0.5, y: 0.1 },
              { x: 0.2, y: 0.9 },
            ],
            [
              { x: 0.5, y: 0.1 },
              { x: 0.8, y: 0.9 },
            ],
            [
              { x: 0.32, y: 0.6 },
              { x: 0.68, y: 0.6 },
            ],
          ],
        },
      ],
    },
    null,
    2,
  ),
  MATCHING: choiceTemplate('MATCHING', 'Which one is the cat?', '🐈', ['🐈', '🐕', '🐇']),
  COUNTING: choiceTemplate('COUNTING', 'How many apples?', '🍎🍎', ['1', '2', '3']),
  SORTING: choiceTemplate('SORTING', 'Which one is a fruit?', '🍌', ['🍌', '🚗', '👟']),
  COLOURING: choiceTemplate('COLOURING', 'Which one is red?', '🔴', ['🔴', '🟢', '🔵']),
  FLASHCARD: cardTemplate('FLASHCARD', 'Apple', 'A is for apple.', '🍎'),
  RHYME: cardTemplate('RHYME', 'Twinkle twinkle', 'Twinkle, twinkle, little star.', '⭐'),
  STORY: cardTemplate('STORY', 'The hungry cat', 'Once there was a cat who was very hungry.', '🐈'),
};

function choiceTemplate(kind: string, say: string, glyph: string, options: string[]): string {
  return JSON.stringify(
    { kind, items: [{ prompt: { say, glyph }, options, answer: 0 }] },
    null,
    2,
  );
}

function cardTemplate(kind: string, title: string, say: string, glyph: string): string {
  return JSON.stringify({ kind, items: [{ glyph, title, say }] }, null, 2);
}

export function NewActivityForm({
  skills,
  classLevels,
  books,
  chapters,
}: {
  skills: Option[];
  classLevels: Option[];
  books: BookOption[];
  chapters: ChapterOption[];
}) {
  const [state, formAction] = useActionState<ActivityState, FormData>(createActivityAction, {});
  const [type, setType] = useState<string>('COUNTING');
  const [content, setContent] = useState<string>(TEMPLATES.COUNTING!);

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
            onChange={(event) => {
              const next = event.target.value;
              setType(next);
              // Swapping type without swapping the content would guarantee a
              // rejection, so the example follows the choice.
              setContent(TEMPLATES[next] ?? '');
            }}
          >
            {ACTIVITY_TYPES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
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

      <PlacementFields books={books} chapters={chapters} />

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

      <ContentField value={content} onChange={setContent} type={type} />

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

      <PlacementFields
        books={books}
        chapters={chapters}
        book={activity.book?.id}
        chapter={activity.chapter?.id}
      />

      <ContentField value={draft} onChange={setDraft} type={activity.type} />

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

function ContentField({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (next: string) => void;
  type: string;
}) {
  const items = countItems(value);

  return (
    <Field
      label="What the child sees"
      required
      hint={
        type === 'TRACING'
          ? 'Strokes are 0–1 coordinates, so they render on any screen size.'
          : 'Every question needs a picture or a sound — a child of four cannot read the words.'
      }
    >
      <Textarea
        name="content"
        rows={16}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono text-xs"
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {items === null ? 'Not valid JSON yet.' : `${items} ${items === 1 ? 'item' : 'items'}.`}
      </p>
    </Field>
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
