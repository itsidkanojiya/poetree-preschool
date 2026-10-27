'use client';

import { TRACING_PATTERNS, type QuestionRow } from '@poetree/shared';
import { Field, Input } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { ChoiceEditor } from './choice';
import { isChoiceType, promptStyle, sayCopy } from './kinds';
import { PairsEditor } from './pairs';
import { CountEditor, GapEditor, HuntEditor, VerseEditor } from './settings';
import { fileIdOf, PromptPicture } from './shared';
import { SortEditor } from './sort';

/**
 * Everything a question asks for, laid out for its type.
 *
 * The same fields whether the question is being added or edited: `question`
 * is what it holds now, absent for a new one. The type travels with the form
 * as `kind`, so the action reads the fields this type has and no others.
 */
export function QuestionFields({ type, question }: { type: string; question?: QuestionRow }) {
  const say = sayCopy(type);

  return (
    <>
      <input type="hidden" name="kind" value={type} />

      <Field label={say.label} required hint={question ? undefined : say.hint}>
        <Input
          name="say"
          required
          defaultValue={question?.say ?? say.initial ?? ''}
          placeholder={say.placeholder}
        />
      </Field>

      <PromptFields type={type} question={question} />

      <TypeEditor type={type} question={question} />
    </>
  );
}

/** What is shown above the question, when this type shows anything. */
function PromptFields({ type, question }: { type: string; question?: QuestionRow }) {
  const style = promptStyle(type);
  const currentId = fileIdOf(question?.promptImageUrl) || null;

  switch (style) {
    case 'none':
      return null;
    case 'glyph':
      return (
        <Field
          label="The letter, number or pattern"
          hint="English, Hindi or Gujarati — A, क, ક, 7, ૭ — or pick a pattern. The path comes with it."
        >
          <Input
            name="promptGlyph"
            defaultValue={question?.promptGlyph ?? ''}
            placeholder="A"
            list="tracing-glyphs"
          />
          <TracingGlyphList />
        </Field>
      );
    case 'illustration':
      return (
        <PromptPicture
          currentId={currentId}
          label="Picture"
          hint="Shown with the words. Choose one from the library, or upload a new one."
        />
      );
    case 'colour':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <PromptPicture
            currentId={currentId}
            label="The picture to colour"
            hint="Shown in grey, as many times as you say; each tap colours one. A see-through background looks best."
          />
          <Field label="or an emoji" hint="Used when there is no picture.">
            <Input name="promptGlyph" defaultValue={question?.promptGlyph ?? ''} placeholder="⚽" />
          </Field>
        </div>
      );
    case 'picture':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <PromptPicture currentId={currentId} />
          <Field label="or an emoji" hint="Shown large, above the choices.">
            <Input name="promptGlyph" defaultValue={question?.promptGlyph ?? ''} placeholder="🍎" />
          </Field>
        </div>
      );
  }
}

function TypeEditor({ type, question }: { type: string; question?: QuestionRow }) {
  if (type === 'TRACING') return <TracePathNote />;
  if (isChoiceType(type)) return <ChoiceEditor type={type} question={question} />;

  switch (type) {
    case 'MATCH_PAIRS':
      return <PairsEditor question={question} />;
    case 'SORT_GROUPS':
      return <SortEditor question={question} />;
    case 'COUNT_OUT':
      return <CountEditor question={question} />;
    case 'FILL_GAP':
      return <GapEditor question={question} />;
    case 'LETTER_HUNT':
      return <HuntEditor question={question} />;
    case 'RHYME':
    case 'STORY':
      return <VerseEditor type={type} question={question} />;
    default:
      // A flashcard is its words and its picture, both above.
      return null;
  }
}

/** The patterns, offered as the author types; any letter can still be typed. */
function TracingGlyphList() {
  return (
    <datalist id="tracing-glyphs">
      {TRACING_PATTERNS.map((pattern) => (
        <option key={pattern.key} value={pattern.key}>
          {pattern.label}
        </option>
      ))}
    </datalist>
  );
}

/**
 * What used to be a drawing canvas.
 *
 * Authors drew each path by hand, one question at a time, which is how the
 * shipped letters came to be straight-line skeletons — a B with no bumps, a
 * two shaped like a Z. An "a" is the same "a" in every book and every school,
 * so it is built in and there is nothing here to get wrong.
 */
function TracePathNote() {
  return (
    <Notice tone="info" title="The path is built in">
      A child traces the standard shape for the letter or number above, in the order it is written.
      Nothing to draw.
    </Notice>
  );
}
