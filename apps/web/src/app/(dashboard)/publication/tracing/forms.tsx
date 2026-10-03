'use client';

import { useActionState } from 'react';
import {
  TRACING_PATTERNS,
  type TracingCategoryAdmin,
  type TracingItemAdmin,
} from '@poetree/shared';
import { FormError, Input, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  addItemAction,
  renameCategoryAction,
  setItemActiveAction,
  setItemVideoAction,
  type TracingState,
} from './actions';

const PATTERN_NAMES = new Map<string, string>(TRACING_PATTERNS.map((p) => [p.key, p.label]));

/** A category's name, and the three symbols its card shows a child. */
export function CategoryForm({ category }: { category: TracingCategoryAdmin }) {
  const [state, formAction] = useActionState<TracingState, FormData>(
    renameCategoryAction.bind(null, category.id),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="min-w-[12rem] flex-1 text-xs text-slate-500">
        Name
        <Input name="name" defaultValue={category.name} maxLength={80} className="mt-1" />
      </label>
      <label className="text-xs text-slate-500">
        On the card
        <Input name="label" defaultValue={category.label} maxLength={40} className="mt-1 w-36" />
      </label>
      <SubmitButton variant="secondary">Save</SubmitButton>
      <div className="w-full">
        <FormError message={state.error} />
      </div>
      <Toast message={state.success} />
    </form>
  );
}

/**
 * One letter: its shape, its video link, and whether it is offered.
 *
 * The link is saved on its own, row by row, because that is how they arrive —
 * one video finished at a time, not twenty-six at once.
 */
export function ItemRow({ item }: { item: TracingItemAdmin }) {
  const [state, formAction] = useActionState<TracingState, FormData>(
    setItemVideoAction.bind(null, item.id),
    {},
  );
  const broken = Boolean(item.videoUrl) && !item.videoId;
  const pattern = PATTERN_NAMES.get(item.glyph);

  return (
    <li
      className={`flex flex-wrap items-center gap-3 border-b border-navy-950/[0.05] py-2.5 ${
        item.isActive ? '' : 'opacity-50'
      }`}
    >
      {pattern ? (
        <span className="grid h-12 w-24 shrink-0 place-items-center rounded-xl bg-navy-50 px-1 text-center text-[11px] font-semibold leading-tight text-navy-900">
          {pattern}
        </span>
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy-50 text-2xl font-semibold text-navy-900">
          {item.glyph}
        </span>
      )}

      <form action={formAction} className="flex min-w-[16rem] flex-1 items-center gap-2">
        <Input
          name="videoUrl"
          defaultValue={item.videoUrl ?? ''}
          placeholder="YouTube link for this letter"
          aria-label={`Video for ${item.glyph}`}
          className="flex-1"
        />
        <SubmitButton variant="secondary">Save</SubmitButton>
      </form>

      <span className="w-24 text-xs">
        {broken ? (
          <span className="font-medium text-rose-700">Link broken</span>
        ) : item.videoId ? (
          <a
            href={`https://www.youtube.com/watch?v=${item.videoId}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-leaf-800 hover:underline"
          >
            Video ✓
          </a>
        ) : (
          <span className="text-gold-800">No video</span>
        )}
      </span>

      <form action={setItemActiveAction.bind(null, item.id, !item.isActive)}>
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
        >
          {item.isActive ? 'Take out' : 'Put back'}
        </button>
      </form>

      {state.error && <p className="w-full text-xs text-rose-700">{state.error}</p>}
      <Toast message={state.success} />
    </li>
  );
}

/** Adds a letter the stroke table can draw, picked from the ones it has. */
export function AddItemForm({ categoryId, glyphs }: { categoryId: string; glyphs: string[] }) {
  const [state, formAction] = useActionState<TracingState, FormData>(
    addItemAction.bind(null, categoryId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 pt-4">
      <label className="text-xs text-slate-500">
        Letter, number or pattern
        <Input
          name="glyph"
          list="tracing-glyphs"
          required
          maxLength={40}
          placeholder="e.g. 0"
          className="mt-1 w-44"
        />
        <datalist id="tracing-glyphs">
          {glyphs.map((glyph) => (
            <option key={glyph} value={glyph} />
          ))}
        </datalist>
      </label>
      <label className="min-w-[14rem] flex-1 text-xs text-slate-500">
        Video (optional)
        <Input name="videoUrl" placeholder="YouTube link" className="mt-1" />
      </label>
      <SubmitButton>Add</SubmitButton>
      <div className="w-full">
        <FormError message={state.error} />
      </div>
      <Toast message={state.success} />
    </form>
  );
}
