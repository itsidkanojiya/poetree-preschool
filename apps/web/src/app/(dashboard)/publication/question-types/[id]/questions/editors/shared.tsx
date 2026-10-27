'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/form';
import { PictureField } from '@/components/picture-library';

/** The bare id out of `/api/v1/catalogue/assets/<id>`. */
export function fileIdOf(url: string | null | undefined): string {
  return url ? (url.split('/').pop() ?? '') : '';
}

/**
 * A heading over a group of slots. Not a <label>: the slots below hold several
 * inputs and buttons each, and a label sends a click anywhere in it to the
 * first of them.
 */
export function SlotsHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</p>
  );
}

/** A hint under a group of slots. */
export function SlotsHint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-slate-500">{children}</p>;
}

/**
 * A picture from the library, an emoji or a number, or a word: one thing a
 * child looks at. Every slot in every editor is one of these, named by
 * `prefix` so the action can read it back as `<prefix>-fileId`,
 * `<prefix>-image`, `<prefix>-glyph` and `<prefix>-text`.
 */
export function MediaInputs({
  prefix,
  imageUrl,
  glyph,
  text,
  glyphPlaceholder = 'Emoji or 3',
  textPlaceholder = 'or a word',
}: {
  prefix: string;
  imageUrl?: string | null;
  glyph?: string | null;
  text?: string | null;
  glyphPlaceholder?: string;
  textPlaceholder?: string;
}) {
  return (
    <div className="space-y-2">
      {/* From the library, or uploaded: the same apple is chosen again on the
          next page rather than uploaded again. */}
      <PictureField
        fileIdName={`${prefix}-fileId`}
        uploadName={`${prefix}-image`}
        currentId={fileIdOf(imageUrl) || null}
        compact
      />
      <div className="flex gap-2">
        <Input
          name={`${prefix}-glyph`}
          defaultValue={glyph ?? ''}
          placeholder={glyphPlaceholder}
          className="w-28"
        />
        <Input name={`${prefix}-text`} defaultValue={text ?? ''} placeholder={textPlaceholder} />
      </div>
    </div>
  );
}

/** The frame every slot sits in: its number on the left, anything else on the right. */
export function Slot({
  number,
  aside,
  children,
}: {
  number: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-navy-950/[0.08]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {number}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * The picture shown above a question. Not a <Field>: that is a <label>, and a
 * label around several buttons sends a click anywhere in it to the first.
 */
export function PromptPicture({
  currentId,
  label = 'Picture above the activity',
  hint = 'Optional. Choose one already in the library, or upload a new one.',
}: {
  currentId?: string | null;
  label?: string;
  hint?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-navy-950">{label}</span>
      <PictureField fileIdName="prompt-fileId" uploadName="prompt-image" currentId={currentId} />
      <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
    </div>
  );
}
