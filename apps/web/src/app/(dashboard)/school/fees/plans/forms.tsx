'use client';

import { useState, useTransition, type FormEvent } from 'react';
import {
  saveFeePlanSchema,
  type AcademicYearSummary,
  type FeePlanView,
  type FeeReminderPolicyView,
} from '@poetree/shared';
import { Button, Field, FormError, Input } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Notice } from '@/components/ui/layout';
import { Toast } from '@/components/ui/toast';
import { addMonths, monthName, monthsSpanned } from '../calendar';
import {
  deletePlanAction,
  savePlanAction,
  saveRemindersAction,
  switchPlanAction,
  type PlanBody,
  type PlanState,
} from './actions';

const SMALL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50 disabled:opacity-40';

const CHECKBOX = 'h-4 w-4 rounded border-navy-300';

type ClassLevel = { id: string; name: string };

/* -------------------------------------------------------------------------- */
/* Installment rows                                                           */
/* -------------------------------------------------------------------------- */

interface Row {
  key: number;
  label: string;
  dueDate: string;
  /** Text while it is typed, so a cleared box stays cleared. */
  weight: string;
}

let lastKey = 0;
const rowKey = () => (lastKey += 1);

const PRESETS = [
  { name: 'Annual', count: 1 },
  { name: 'Half-yearly', count: 2 },
  { name: 'Quarterly', count: 4 },
  { name: 'Monthly', count: 12 },
] as const;

/**
 * A pattern's installments, spread over the year from its first day:
 * half-yearly six months apart, quarterly three. Monthly is one a month for
 * as many months as the year has, so a year that runs June to March gets ten
 * rather than twelve that run past its end.
 */
function presetRows(count: number, year: AcademicYearSummary): Row[] {
  const start = year.startDate.slice(0, 10);
  const span = Math.min(12, Math.max(1, monthsSpanned(start, year.endDate.slice(0, 10))));
  const total = count === 12 ? span : count;

  return Array.from({ length: total }, (_, index) => {
    const dueDate = addMonths(start, Math.round((index * span) / total));
    const label =
      count === 1
        ? 'Annual'
        : count === 2
          ? `H${index + 1}`
          : count === 4
            ? `Q${index + 1}`
            : monthName(dueDate);
    return { key: rowKey(), label, dueDate, weight: '1' };
  });
}

function bodyOf(plan: FeePlanView): PlanBody {
  return {
    academicYearId: plan.academicYearId,
    name: plan.name,
    isEnabled: plan.isEnabled,
    classLevelIds: plan.classLevelIds,
    installments: plan.installments.map(({ label, dueDate, weight }) => ({
      label,
      dueDate,
      weight,
    })),
  };
}

/**
 * Checked here first, so a slip is pointed out at once and in words before
 * anything is sent. The API checks the same rules again.
 */
function checkPlan(body: PlanBody): string | null {
  if (body.installments.some((installment) => !installment.dueDate)) {
    return 'Give each installment a due date.';
  }
  if (
    body.installments.some(
      (installment) =>
        !Number.isInteger(installment.weight) || installment.weight < 1 || installment.weight > 100,
    )
  ) {
    return 'A weight is a whole number from 1 to 100.';
  }
  const parsed = saveFeePlanSchema.safeParse(body);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the plan.');
}

/* -------------------------------------------------------------------------- */
/* A plan: add or edit                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A plan's name, the classes it is offered to and its installments, edited as
 * a whole and saved at once.
 *
 * A plan families already pay by keeps its installments — the API refuses to
 * move what they owe under them — so for one of those the installments are
 * shown but locked, and only the name, classes and on/off can change.
 */
export function PlanForm({
  plan,
  year,
  classLevels,
  onSaved,
}: {
  plan?: FeePlanView;
  year: AcademicYearSummary;
  classLevels: ClassLevel[];
  /** After an edit is saved; the new-plan form clears itself instead. */
  onSaved?: (message: string) => void;
}) {
  const selections = plan?.selections ?? 0;
  const locked = selections > 0;

  const [name, setName] = useState(plan?.name ?? '');
  const [isEnabled, setEnabled] = useState(plan?.isEnabled ?? true);
  const [classIds, setClassIds] = useState<string[]>(plan?.classLevelIds ?? []);
  const [rows, setRows] = useState<Row[]>(() =>
    (plan?.installments ?? []).map((installment) => ({
      key: rowKey(),
      label: installment.label,
      dueDate: installment.dueDate,
      weight: String(installment.weight),
    })),
  );
  const [state, setState] = useState<PlanState>({});
  const [pending, startTransition] = useTransition();

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => {
      const last = current[current.length - 1];
      return [
        ...current,
        {
          key: rowKey(),
          label: '',
          dueDate: last?.dueDate ? addMonths(last.dueDate, 1) : year.startDate.slice(0, 10),
          weight: '1',
        },
      ];
    });

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setRows(presetRows(preset.count, year));
    // A blank name takes the pattern's, which is usually what the school
    // calls it anyway.
    if (!name.trim()) setName(preset.name);
  };

  const weightSum = rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body: PlanBody = {
      academicYearId: year.id,
      name: name.trim(),
      isEnabled,
      classLevelIds: classIds,
      installments: rows.map((row) => ({
        label: row.label.trim(),
        dueDate: row.dueDate,
        weight: Number(row.weight),
      })),
    };

    const slip = checkPlan(body);
    if (slip) {
      setState({ error: slip });
      return;
    }

    startTransition(async () => {
      const result = await savePlanAction(plan?.id ?? null, body);
      if (result.error || !result.success) {
        setState(result);
      } else if (plan) {
        setState({});
        onSaved?.(result.success);
      } else {
        setState(result);
        setName('');
        setEnabled(true);
        setClassIds([]);
        setRows([]);
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required hint="What families see in the app: Quarterly, Monthly.">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Quarterly"
          />
        </Field>

        <label className="flex items-start gap-2.5 self-center text-sm text-navy-950">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className={`mt-0.5 ${CHECKBOX}`}
          />
          <span>
            <span className="block font-medium">Offered to families</span>
            <span className="block text-xs text-slate-500">
              Switched off, nobody new can choose it. Families already on it stay on it.
            </span>
          </span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Classes
        </legend>
        <p className="text-xs text-slate-500">Tick none to offer it to every class.</p>
        {classLevels.length === 0 ? (
          <p className="text-xs text-slate-500">No classes are set up yet.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-3">
            {classLevels.map((level) => (
              <label key={level.id} className="flex items-center gap-2 text-sm text-navy-950">
                <input
                  type="checkbox"
                  checked={classIds.includes(level.id)}
                  onChange={(event) =>
                    setClassIds((current) =>
                      event.target.checked
                        ? [...current, level.id]
                        : current.filter((id) => id !== level.id),
                    )
                  }
                  className={CHECKBOX}
                />
                {level.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Installments
        </legend>

        {locked ? (
          <Notice tone="info">
            {selections} {selections === 1 ? 'child is' : 'children are'} on this plan, so its
            installments are fixed. You can still rename it, change its classes or switch it off.
            For a different schedule, add a new plan and move children across from each child’s
            page.
          </Notice>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            Start from:
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={SMALL}
                onClick={() => applyPreset(preset)}
              >
                {preset.name} ({preset.count})
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No installments yet. Start from a pattern above, or add them one by one.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden gap-2 text-xs text-slate-500 sm:grid sm:grid-cols-[minmax(0,1fr)_9.5rem_4.5rem_3rem_4.5rem]">
              <span>Label</span>
              <span>Due date</span>
              <span>Weight</span>
              <span className="text-right">Share</span>
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_4.5rem_3rem_4.5rem]"
              >
                <Input
                  aria-label={`Installment ${index + 1} label`}
                  value={row.label}
                  maxLength={40}
                  placeholder={`Installment ${index + 1}`}
                  disabled={locked}
                  onChange={(event) => change(row.key, { label: event.target.value })}
                  className="col-span-2 sm:col-span-1"
                />
                <Input
                  aria-label={`Installment ${index + 1} due date`}
                  type="date"
                  value={row.dueDate}
                  disabled={locked}
                  onChange={(event) => change(row.key, { dueDate: event.target.value })}
                />
                <Input
                  aria-label={`Installment ${index + 1} weight`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={row.weight}
                  disabled={locked}
                  onChange={(event) => change(row.key, { weight: event.target.value })}
                />
                <span className="text-right text-xs text-slate-500" data-numeric>
                  {weightSum > 0
                    ? `${Math.round(((Number(row.weight) || 0) / weightSum) * 100)}%`
                    : '—'}
                </span>
                <button
                  type="button"
                  className={SMALL}
                  disabled={locked}
                  onClick={() =>
                    setRows((current) => current.filter((other) => other.key !== row.key))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!locked && (
          <Button type="button" variant="secondary" disabled={rows.length >= 12} onClick={addRow}>
            Add installment
          </Button>
        )}

        <p className="text-xs text-slate-500">
          The weight is an installment’s share of the year’s fees: 1, 1, 1 is three equal parts; 2,
          1, 1 is half up front and a quarter twice. Keep them in date order. Once a family chooses
          the plan, each installment becomes an invoice due on its date.
        </p>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : plan ? 'Save plan' : 'Add plan'}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* A plan: edit, switch off, delete                                           */
/* -------------------------------------------------------------------------- */

export function PlanControls({
  plan,
  year,
  classLevels,
}: {
  plan: FeePlanView;
  year: AcademicYearSummary;
  classLevels: ClassLevel[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<PlanState>({});
  const [pending, startTransition] = useTransition();
  // Remounts the delete button, which closes its dialog when the API refuses.
  const [attempt, setAttempt] = useState(0);

  const toggle = () =>
    startTransition(async () => {
      setState(await switchPlanAction(plan.id, { ...bodyOf(plan), isEnabled: !plan.isEnabled }));
    });

  // Only a refusal comes back to act on: once deleted, the plan and this
  // button with it are gone from the page.
  const remove = async () => {
    const result = await deletePlanAction(plan.id);
    if (result.error) {
      setState(result);
      setAttempt((count) => count + 1);
    }
  };

  return (
    <div className="space-y-3 border-t border-navy-950/[0.06] pt-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SMALL} onClick={() => setEditing((open) => !open)}>
          {editing ? 'Close' : 'Edit'}
        </button>
        <button type="button" className={SMALL} disabled={pending} onClick={toggle}>
          {pending ? 'Saving…' : plan.isEnabled ? 'Switch off' : 'Switch on'}
        </button>
        {plan.selections === 0 && (
          <ConfirmButton
            key={attempt}
            action={remove}
            label="Delete"
            title={`Delete “${plan.name}”?`}
            body="Nobody is on this plan, so nothing has been billed by it. It goes for good."
            confirmLabel="Delete it"
          />
        )}
      </div>

      {editing && (
        <div className="rounded-xl bg-navy-50/40 p-4 ring-1 ring-navy-950/[0.06]">
          <PlanForm
            plan={plan}
            year={year}
            classLevels={classLevels}
            onSaved={(message) => {
              setEditing(false);
              setState({ success: message });
            }}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

const DAY_CHOICES = [14, 7, 3, 1];

/** A number box's text as a whole number in range, or why not. */
function whole(text: string, min: number, max: number, what: string): number | string {
  const value = Number(text);
  if (text.trim() === '' || !Number.isInteger(value) || value < min || value > max) {
    return `Enter ${what} as a whole number from ${min} to ${max}.`;
  }
  return value;
}

/**
 * When the school reminds families about an installment: some days before,
 * on the day, and while it is overdue.
 */
export function ReminderForm({ policy }: { policy: FeeReminderPolicyView }) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [daysBefore, setDaysBefore] = useState<number[]>(policy.daysBefore);
  const [onDueDate, setOnDueDate] = useState(policy.onDueDate);
  const [graceDays, setGraceDays] = useState(String(policy.graceDays));
  const [everyDays, setEveryDays] = useState(String(policy.overdueEveryDays));
  const [maxCount, setMaxCount] = useState(String(policy.overdueMaxCount));
  const [state, setState] = useState<PlanState>({});
  const [pending, startTransition] = useTransition();

  // A day saved before that is not one of the usual ones stays on offer, so
  // saving here never drops it unseen.
  const choices = [...new Set([...DAY_CHOICES, ...policy.daysBefore])].sort((a, b) => b - a);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const grace = whole(graceDays, 0, 60, 'the grace days');
    const every = whole(everyDays, 0, 60, 'how often to repeat');
    const most = whole(maxCount, 0, 12, 'the most overdue reminders');
    const slip = [grace, every, most].find((value) => typeof value === 'string');
    if (typeof slip === 'string') {
      setState({ error: slip });
      return;
    }

    startTransition(async () => {
      setState(
        await saveRemindersAction({
          enabled,
          daysBefore: [...daysBefore].sort((a, b) => b - a),
          onDueDate,
          graceDays: grace as number,
          overdueEveryDays: every as number,
          overdueMaxCount: most as number,
        }),
      );
    });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <label className="flex items-start gap-2.5 text-sm text-navy-950">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className={`mt-0.5 ${CHECKBOX}`}
        />
        <span>
          <span className="block font-medium">Remind families about installments</span>
          <span className="block text-xs text-slate-500">
            In the app, to every guardian of the child.
          </span>
        </span>
      </label>

      <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-50">
        <div className="space-y-2">
          <p className="text-sm font-medium text-navy-950">Before the due date</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((days) => (
              <label
                key={days}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-navy-950 ring-1 ring-inset ring-navy-950/15 has-[:checked]:bg-navy-50 has-[:checked]:ring-navy-900"
              >
                <input
                  type="checkbox"
                  checked={daysBefore.includes(days)}
                  onChange={(event) =>
                    setDaysBefore((current) =>
                      event.target.checked
                        ? [...current, days]
                        : current.filter((other) => other !== days),
                    )
                  }
                  className={CHECKBOX}
                />
                {days} {days === 1 ? 'day' : 'days'}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium text-navy-950">
          <input
            type="checkbox"
            checked={onDueDate}
            onChange={(event) => setOnDueDate(event.target.checked)}
            className={CHECKBOX}
          />
          On the due date
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Grace days" hint="After the due date, before the first overdue reminder.">
            <Input
              type="number"
              min={0}
              max={60}
              value={graceDays}
              onChange={(event) => setGraceDays(event.target.value)}
            />
          </Field>
          <Field label="Repeat every (days)" hint="While overdue. 0 sends none.">
            <Input
              type="number"
              min={0}
              max={60}
              value={everyDays}
              onChange={(event) => setEveryDays(event.target.value)}
            />
          </Field>
          <Field label="At most" hint="Overdue reminders for one installment.">
            <Input
              type="number"
              min={0}
              max={12}
              value={maxCount}
              onChange={(event) => setMaxCount(event.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <p className="text-xs text-slate-500">
        Reminders are sent by the server between 9 am and 8 pm, and stop once the installment is
        paid.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save reminders'}
      </Button>
    </form>
  );
}
