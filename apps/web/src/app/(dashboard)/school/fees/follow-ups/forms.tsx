'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  FEE_FOLLOW_UP_OUTCOMES,
  type FeeFollowUpOutcome,
  type OverdueFamily,
} from '@poetree/shared';
import { Button, Field, FormError, Input, Select, Textarea } from '@/components/ui/form';
import { TCell, TRow } from '@/components/ui/table';
import { Toast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/format';
import { addDays, formatDay, schoolToday } from '../calendar';
import { closeFollowUpAction, logFollowUpAction, type FollowUpState } from './actions';
import { OUTCOME_LABELS } from './labels';

const SMALL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50 disabled:opacity-40';

/** This device's clock, as a datetime-local input holds it: 2026-10-14T10:30. */
function localNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`;
}

/**
 * One family behind on its fees: the cells the page rendered, a button to log
 * a follow-up, and the form for it opened full width beneath the row.
 */
export function FamilyRow({
  family,
  columns,
  children,
}: {
  family: OverdueFamily;
  /** How many columns the form's row spans. */
  columns: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <>
      <TRow>
        {children}
        <TCell className="text-right">
          <button
            type="button"
            className={`${SMALL} whitespace-nowrap`}
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            {open ? 'Close' : 'Log follow-up'}
          </button>
          <Toast message={saved} />
        </TCell>
      </TRow>
      {open && (
        <tr>
          <td colSpan={columns} className="border-b border-navy-950/[0.05] bg-navy-50/40 px-3 py-4">
            <LogFollowUpForm
              family={family}
              onCancel={() => setOpen(false)}
              onSaved={(message) => {
                setOpen(false);
                setSaved(message);
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * What came of a call, and when to try again.
 *
 * Mounted only once "Log follow-up" is pressed, so "now" and "today" are read
 * from this device's clock at that moment rather than when the page was drawn.
 */
function LogFollowUpForm({
  family,
  onSaved,
  onCancel,
}: {
  family: OverdueFamily;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [today] = useState(schoolToday);
  const [invoiceId, setInvoiceId] = useState(family.invoices[0]?.id ?? '');
  const [contactedAt, setContactedAt] = useState(localNow);
  const [outcome, setOutcome] = useState<FeeFollowUpOutcome | ''>('');
  const [note, setNote] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const [remindParent, setRemindParent] = useState(true);
  const [state, setState] = useState<FollowUpState>({});
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const slip = !invoiceId
      ? 'Choose the installment.'
      : !followUpOn
        ? 'Choose when to follow up.'
        : followUpOn < today
          ? 'Choose a follow-up date from today onwards.'
          : null;
    if (slip) {
      setState({ error: slip });
      return;
    }

    startTransition(async () => {
      const result = await logFollowUpAction({
        invoiceId,
        // Read as this device's local time and sent as an instant.
        contactedAt: contactedAt ? new Date(contactedAt).toISOString() : null,
        outcome: outcome || null,
        note: note.trim() || null,
        followUpOn,
        remindParent,
      });
      if (result.success) onSaved(result.success);
      else setState(result);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Installment" required>
          <Select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
            {family.invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.periodLabel} · {invoice.invoiceNo} · due {formatDay(invoice.dueDate)} ·{' '}
                {formatPrice(invoice.outstandingInPaise)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Contacted at" hint="Clear it to set a reminder date only.">
          <Input
            type="datetime-local"
            value={contactedAt}
            max={localNow()}
            onChange={(event) => setContactedAt(event.target.value)}
          />
        </Field>

        <Field label="Outcome">
          <Select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as FeeFollowUpOutcome | '')}
          >
            <option value="">Not recorded</option>
            {FEE_FOLLOW_UP_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {OUTCOME_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Next follow-up" required>
          <span className="flex gap-2">
            <Input
              type="date"
              value={followUpOn}
              min={today}
              onChange={(event) => setFollowUpOn(event.target.value)}
            />
            <button
              type="button"
              className={`${SMALL} whitespace-nowrap`}
              onClick={() => setFollowUpOn(addDays(today, 7))}
            >
              Next week
            </button>
          </span>
        </Field>
      </div>

      <Field label="Note" hint={`${note.length}/300`}>
        <Textarea
          value={note}
          rows={2}
          maxLength={300}
          placeholder="Will pay after the 10th, when salary comes."
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-navy-950">
        <input
          type="checkbox"
          checked={remindParent}
          onChange={(event) => setRemindParent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-navy-300"
        />
        <span>
          <span className="block font-medium">Remind the parent on that date</span>
          <span className="block text-xs text-slate-500">
            In the app, between 9 am and 8 pm. Not sent if the installment is paid by then.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save follow-up'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Closes an open follow-up: done, or no longer needed. */
export function CloseFollowUp({ followUpId }: { followUpId: string }) {
  const [state, setState] = useState<FollowUpState>({});
  const [pending, startTransition] = useTransition();

  const close = (status: 'COMPLETED' | 'CANCELLED') =>
    startTransition(async () => {
      setState(await closeFollowUpAction(followUpId, status));
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${SMALL} whitespace-nowrap`}
          disabled={pending}
          onClick={() => close('COMPLETED')}
        >
          Mark done
        </button>
        <button
          type="button"
          className={SMALL}
          disabled={pending}
          aria-label="Cancel this follow-up"
          onClick={() => close('CANCELLED')}
        >
          Cancel
        </button>
      </div>
      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </div>
  );
}
