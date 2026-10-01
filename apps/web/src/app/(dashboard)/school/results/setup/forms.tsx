'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  GRADE_SCALE_PRESETS,
  REPORT_AREA_GROUPS,
  type GradeLevelSummary,
  type GradeScalePreset,
  type ReportAreaSummary,
  type TermSummary,
} from '@poetree/shared';
import { Button, FormError, Input, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  addAreaPresetAction,
  createAreaAction,
  createTermAction,
  renameAreaAction,
  saveScaleAction,
  setAreaActiveAction,
  setTermActiveAction,
  swapAreasAction,
  updateTermAction,
  type SetupState,
} from './actions';

const SMALL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50 disabled:opacity-40';

/* -------------------------------------------------------------------------- */
/* Grading scale                                                              */
/* -------------------------------------------------------------------------- */

interface Level {
  id?: string;
  label: string;
  description: string;
}

function fromScale(scale: GradeLevelSummary[]): Level[] {
  return scale.map((level) => ({
    id: level.id,
    label: level.label,
    description: level.description ?? '',
  }));
}

const PRESET_NAMES: Record<GradeScalePreset, string> = {
  words: 'Words',
  letters: 'Letters',
  stars: 'Stars',
};

/**
 * The school's grades, best first. Edited as a whole and saved at once, since
 * the order is the meaning: the first is the best.
 */
export function ScaleEditor({ scale }: { scale: GradeLevelSummary[] }) {
  const [levels, setLevels] = useState<Level[]>(() => fromScale(scale));
  // After a save the page comes back with ids for the new grades; take them,
  // or saving twice would try to create the same grades again.
  const [source, setSource] = useState(scale);
  if (source !== scale) {
    setSource(scale);
    setLevels(fromScale(scale));
  }
  const [state, setState] = useState<SetupState>({});
  const [pending, startTransition] = useTransition();

  const change = (index: number, patch: Partial<Level>) =>
    setLevels((current) =>
      current.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    );

  const move = (index: number, by: -1 | 1) =>
    setLevels((current) => {
      const next = [...current];
      const [level] = next.splice(index, 1);
      next.splice(index + by, 0, level!);
      return next;
    });

  // A preset takes the place of the grades already there, one for one, so a
  // child graded "Excellent" in draft is graded "A+" after — not ungraded.
  const applyPreset = (preset: GradeScalePreset) =>
    setLevels((current) =>
      GRADE_SCALE_PRESETS[preset].map((level, i) => ({
        id: current[i]?.id,
        label: level.label,
        description: level.description,
      })),
    );

  function save() {
    startTransition(async () => {
      setState(
        await saveScaleAction(
          levels.map((level) => ({
            id: level.id,
            label: level.label,
            description: level.description.trim() || null,
          })),
        ),
      );
    });
  }

  return (
    <div className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        Start from:
        {(Object.keys(PRESET_NAMES) as GradeScalePreset[]).map((preset) => (
          <button key={preset} type="button" className={SMALL} onClick={() => applyPreset(preset)}>
            {PRESET_NAMES[preset]} ({GRADE_SCALE_PRESETS[preset].map((l) => l.label).join(', ')})
          </button>
        ))}
      </div>

      <ol className="space-y-2">
        {levels.map((level, index) => (
          <li key={level.id ?? `new-${index}`} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-right text-sm font-semibold text-slate-400">{index + 1}</span>
            <Input
              aria-label={`Grade ${index + 1}`}
              value={level.label}
              maxLength={30}
              onChange={(event) => change(index, { label: event.target.value })}
              className="w-40"
            />
            <Input
              aria-label={`What grade ${index + 1} means`}
              value={level.description}
              maxLength={120}
              placeholder="What it means, for families"
              onChange={(event) => change(index, { description: event.target.value })}
              className="min-w-[16rem] flex-1"
            />
            <button
              type="button"
              className={SMALL}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className={SMALL}
              disabled={index === levels.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className={SMALL}
              disabled={levels.length <= 2}
              onClick={() => setLevels((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={levels.length >= 8}
          onClick={() => setLevels((current) => [...current, { label: '', description: '' }])}
        >
          Add a grade
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save scale'}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Best first. A grade you remove stays on report cards already sent.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                      */
/* -------------------------------------------------------------------------- */

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function TermRow({ term }: { term: TermSummary }) {
  const [state, formAction] = useActionState<SetupState, FormData>(
    updateTermAction.bind(null, term.id),
    {},
  );
  const [pending, startTransition] = useTransition();

  return (
    <li
      className={`rounded-xl p-3 ring-1 ring-navy-950/[0.07] ${term.isActive ? '' : 'bg-slate-50 opacity-70'}`}
    >
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem] flex-1 text-xs text-slate-500">
          Name
          <Input name="name" defaultValue={term.name} maxLength={60} className="mt-1" />
        </label>
        <label className="text-xs text-slate-500">
          Starts
          <Input name="startsOn" type="date" defaultValue={day(term.startsOn)} className="mt-1" />
        </label>
        <label className="text-xs text-slate-500">
          Ends
          <Input name="endsOn" type="date" defaultValue={day(term.endsOn)} className="mt-1" />
        </label>
        <SubmitButton variant="secondary">Save</SubmitButton>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => setTermActiveAction(term.id, !term.isActive))}
        >
          {term.isActive ? 'Hide' : 'Show again'}
        </Button>
      </form>
      <FormError message={state.error} />
      <Toast message={state.success} />
    </li>
  );
}

export function TermsEditor({ terms }: { terms: TermSummary[] }) {
  const [state, formAction] = useActionState<SetupState, FormData>(createTermAction, {});

  return (
    <div className="space-y-4">
      {terms.length > 0 ? (
        <ul className="space-y-2">
          {terms.map((term) => (
            <TermRow key={term.id} term={term} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No terms yet. Most preschools have two or three.</p>
      )}

      <form
        action={formAction}
        className="flex flex-wrap items-end gap-2 border-t border-navy-950/[0.06] pt-4"
      >
        <label className="min-w-[10rem] flex-1 text-xs text-slate-500">
          New term
          <Input
            name="name"
            placeholder={`Term ${terms.length + 1}`}
            required
            maxLength={60}
            className="mt-1"
          />
        </label>
        <label className="text-xs text-slate-500">
          Starts
          <Input name="startsOn" type="date" className="mt-1" />
        </label>
        <label className="text-xs text-slate-500">
          Ends
          <Input name="endsOn" type="date" className="mt-1" />
        </label>
        <SubmitButton>Add term</SubmitButton>
      </form>
      <FormError message={state.error} />
      <Toast message={state.success} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* What a class level is graded on                                            */
/* -------------------------------------------------------------------------- */

function AreaRow({
  area,
  above,
  below,
}: {
  area: ReportAreaSummary;
  above?: ReportAreaSummary;
  below?: ReportAreaSummary;
}) {
  const [renaming, setRenaming] = useState(false);
  const [state, formAction] = useActionState<SetupState, FormData>(
    async (prev: SetupState, formData: FormData) => {
      const result = await renameAreaAction(area.id, prev, formData);
      if (!result.error) setRenaming(false);
      return result;
    },
    {},
  );
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<void>) => startTransition(work);

  return (
    <li className={`flex flex-wrap items-center gap-2 py-1.5 ${area.isActive ? '' : 'opacity-50'}`}>
      {renaming ? (
        <form action={formAction} className="flex flex-1 items-center gap-2">
          <Input name="name" defaultValue={area.name} maxLength={80} autoFocus className="flex-1" />
          <SubmitButton variant="secondary">Save</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <span className="min-w-0 flex-1 text-sm text-navy-950">
          {area.name}
          {!area.isActive && <span className="ml-2 text-xs text-slate-500">(not on the card)</span>}
        </span>
      )}
      {!renaming && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={SMALL}
            aria-label={`Move ${area.name} up`}
            disabled={!above || pending}
            onClick={() => above && run(() => swapAreasAction(above, area))}
          >
            ↑
          </button>
          <button
            type="button"
            className={SMALL}
            aria-label={`Move ${area.name} down`}
            disabled={!below || pending}
            onClick={() => below && run(() => swapAreasAction(area, below))}
          >
            ↓
          </button>
          <button type="button" className={SMALL} onClick={() => setRenaming(true)}>
            Rename
          </button>
          <button
            type="button"
            className={SMALL}
            disabled={pending}
            onClick={() => run(() => setAreaActiveAction(area.id, !area.isActive))}
          >
            {area.isActive ? 'Remove' : 'Put back'}
          </button>
        </div>
      )}
      <FormError message={state.error} />
    </li>
  );
}

export function AreasEditor({
  classLevelId,
  classLevelName,
  areas,
}: {
  classLevelId: string;
  classLevelName: string;
  areas: ReportAreaSummary[];
}) {
  const [state, formAction] = useActionState<SetupState, FormData>(
    createAreaAction.bind(null, classLevelId),
    {},
  );
  const [presetState, setPresetState] = useState<SetupState>({});
  const [pending, startTransition] = useTransition();

  const groups: Array<{ group: string; areas: ReportAreaSummary[] }> = [];
  for (const area of areas) {
    const found = groups.find((g) => g.group === area.group);
    if (found) found.areas.push(area);
    else groups.push({ group: area.group, areas: [area] });
  }
  const headings = Array.from(new Set([...REPORT_AREA_GROUPS, ...groups.map((g) => g.group)]));

  const preset = (kind: 'subjects' | 'development') =>
    startTransition(async () => setPresetState(await addAreaPresetAction(classLevelId, kind)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => preset('subjects')}
        >
          Add {classLevelName}’s book subjects
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => preset('development')}
        >
          Add the usual development areas
        </Button>
      </div>
      <FormError message={presetState.error} />
      <Toast message={presetState.success} />

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nothing to grade yet. Start from the presets above, or add your own below.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.group}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-navy-700">
              {group.group}
            </h3>
            <ul className="divide-y divide-navy-950/[0.05]">
              {group.areas.map((area, index) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  above={group.areas[index - 1]}
                  below={group.areas[index + 1]}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <form
        action={formAction}
        className="flex flex-wrap items-end gap-2 border-t border-navy-950/[0.06] pt-4"
      >
        <label className="text-xs text-slate-500">
          Heading
          <Input
            name="group"
            list="area-groups"
            defaultValue="Subjects"
            maxLength={60}
            className="mt-1 w-44"
          />
          <datalist id="area-groups">
            {headings.map((heading) => (
              <option key={heading} value={heading} />
            ))}
          </datalist>
        </label>
        <label className="min-w-[12rem] flex-1 text-xs text-slate-500">
          What is graded
          <Input
            name="name"
            placeholder="e.g. Number work"
            required
            maxLength={80}
            className="mt-1"
          />
        </label>
        <SubmitButton>Add</SubmitButton>
      </form>
      <FormError message={state.error} />
      <Toast message={state.success} />
    </div>
  );
}
