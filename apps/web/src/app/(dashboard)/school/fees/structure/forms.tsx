'use client';

import { useActionState, useState } from 'react';
import { recurringYearInPaise } from '@poetree/shared';
import { FormError, Input, SubmitButton } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { Toast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/format';
import { addFeeHeadAction, saveStructureAction, type StructureState } from './actions';

export interface HeadOption {
  id: string;
  name: string;
}

/** One fee head's yearly amount, and whether only new children pay it. */
export interface SavedItem {
  yearlyInPaise: number;
  newChildrenOnly: boolean;
}

export interface SavedInstallment {
  dueDate: string;
  amountInPaise: number;
}

export interface SavedPayInFull {
  enabled: boolean;
  discountKind: 'FIXED' | 'PERCENT';
  discountValue: number;
}

/** Adds a kind of fee — Tuition, Admission, Deposit — for every standard to use. */
export function AddHeadForm() {
  const [state, formAction] = useActionState<StructureState, FormData>(addFeeHeadAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <Toast message={state.success} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="mb-1.5 block text-sm font-medium text-navy-950">New fee</span>
          <Input name="headName" placeholder="e.g. Deposit, Admission, Transport" maxLength={80} />
        </label>
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add a fee head
        </SubmitButton>
      </div>
    </form>
  );
}

const toPaise = (rupees: string) => Math.round((Number(rupees) || 0) * 100);
const rupeesOf = (paise: number) => (paise ? String(paise / 100) : '');

/**
 * What one standard pays, and how families pay it.
 *
 * Each fee head is a yearly amount. The installments are typed as dates and
 * amounts, and have to add up to the year: the running total says so, and by
 * how much they are off, before anyone presses Save. A fee for new children
 * only — admission — is added to the first installment by the server.
 */
export function StructureForm({
  academicYearId,
  classLevelId,
  standardName,
  heads,
  saved,
  savedInstallments,
  savedPayInFull,
}: {
  academicYearId: string;
  classLevelId: string;
  standardName: string;
  heads: HeadOption[];
  saved: Record<string, SavedItem>;
  savedInstallments: SavedInstallment[];
  savedPayInFull: SavedPayInFull;
}) {
  const [state, formAction, pending] = useActionState<StructureState, FormData>(
    saveStructureAction.bind(null, academicYearId, classLevelId, standardName),
    {},
  );

  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      heads.map((head) => [
        head.id,
        {
          rupees: rupeesOf(saved[head.id]?.yearlyInPaise ?? 0),
          newChildrenOnly: saved[head.id]?.newChildrenOnly ?? false,
        },
      ]),
    ),
  );
  const [installments, setInstallments] = useState(() =>
    savedInstallments.length > 0
      ? savedInstallments.map((i) => ({ dueDate: i.dueDate, rupees: rupeesOf(i.amountInPaise) }))
      : [{ dueDate: '', rupees: '' }],
  );
  const [payInFull, setPayInFull] = useState(() => ({
    enabled: savedPayInFull.enabled,
    kind: savedPayInFull.discountKind,
    value:
      savedPayInFull.discountKind === 'FIXED'
        ? rupeesOf(savedPayInFull.discountValue)
        : savedPayInFull.discountValue
          ? String(savedPayInFull.discountValue)
          : '',
  }));

  const items = heads.map((head) => ({
    amountInPaise: toPaise(rows[head.id]!.rupees),
    frequency: rows[head.id]!.newChildrenOnly ? ('ONE_TIME' as const) : ('ANNUAL' as const),
  }));
  const yearly = recurringYearInPaise(items);
  const once = items
    .filter((i) => i.frequency === 'ONE_TIME')
    .reduce((sum, i) => sum + i.amountInPaise, 0);
  const typed = installments.reduce((sum, i) => sum + toPaise(i.rupees), 0);
  const gap = yearly - typed;

  const discountOf = (total: number) =>
    !payInFull.enabled
      ? 0
      : payInFull.kind === 'PERCENT'
        ? Math.round((total * Math.min(Number(payInFull.value) || 0, 100)) / 100)
        : Math.min(toPaise(payInFull.value), total);

  const setInstallment = (index: number, patch: Partial<{ dueDate: string; rupees: string }>) =>
    setInstallments((all) => all.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const serialised = JSON.stringify({
    installments: installments
      .filter((i) => i.dueDate || i.rupees)
      .map((i) => ({ dueDate: i.dueDate, amountInPaise: toPaise(i.rupees) })),
    payInFull: {
      enabled: payInFull.enabled,
      discountKind: payInFull.kind,
      discountValue:
        payInFull.kind === 'FIXED'
          ? toPaise(payInFull.value)
          : Math.round(Number(payInFull.value) || 0),
    },
  });

  return (
    <KeptForm action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <Toast message={state.success} />
      <input type="hidden" name="plan" value={serialised} />

      {/* ---- Fees for the year ---- */}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Fees for the year
        </legend>
        <ul className="divide-y divide-navy-950/[0.06]">
          {heads.map((head) => {
            const row = rows[head.id]!;
            return (
              <li key={head.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <span className="min-w-[7rem] flex-1 text-sm font-medium text-navy-950">
                  {head.name}
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">₹</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    name={`amount-${head.id}`}
                    aria-label={`${head.name} for the year, ${standardName}`}
                    value={row.rupees}
                    placeholder="0"
                    onChange={(event) =>
                      setRows((all) => ({
                        ...all,
                        [head.id]: { ...row, rupees: event.target.value },
                      }))
                    }
                    className="w-32"
                  />
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`new-${head.id}`}
                    checked={row.newChildrenOnly}
                    onChange={(event) =>
                      setRows((all) => ({
                        ...all,
                        [head.id]: { ...row, newChildrenOnly: event.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-navy-950/30 text-navy-900 focus:ring-navy-600"
                  />
                  New children only
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm text-slate-600" aria-live="polite">
          <span className="font-medium text-navy-950">Year total: {formatPrice(yearly)}</span>
          {once > 0 && <> (new children {formatPrice(yearly + once)})</>}
          <span className="block text-xs text-slate-500">
            Leave a fee at 0 if this standard does not pay it.
          </span>
        </p>
      </fieldset>

      {/* ---- Installments ---- */}
      <fieldset>
        <div className="mb-2 flex items-center justify-between gap-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Installments
          </legend>
          <button
            type="button"
            onClick={() => setInstallments((all) => [...all, { dueDate: '', rupees: '' }])}
            disabled={installments.length >= 12}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-200 transition-colors hover:bg-navy-50 disabled:opacity-50"
          >
            + Add installment
          </button>
        </div>
        <ol className="space-y-2">
          {installments.map((row, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-sm font-medium text-slate-500">{index + 1}</span>
              <Input
                type="date"
                aria-label={`Installment ${index + 1} due date`}
                value={row.dueDate}
                onChange={(event) => setInstallment(index, { dueDate: event.target.value })}
                className="w-44"
              />
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">₹</span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  aria-label={`Installment ${index + 1} amount`}
                  value={row.rupees}
                  placeholder="0"
                  onChange={(event) => setInstallment(index, { rupees: event.target.value })}
                  className="w-32"
                />
              </label>
              {installments.length > 1 && (
                <button
                  type="button"
                  onClick={() => setInstallments((all) => all.filter((_, i) => i !== index))}
                  aria-label={`Remove installment ${index + 1}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
        <p
          className={`mt-2 text-sm font-medium ${
            typed === 0 ? 'text-slate-500' : gap === 0 ? 'text-leaf-700' : 'text-rose-700'
          }`}
          aria-live="polite"
        >
          {typed === 0
            ? 'Type each installment’s date and amount.'
            : gap === 0
              ? `✓ Adds up to ${formatPrice(yearly)}`
              : `Adds up to ${formatPrice(typed)} — ${formatPrice(Math.abs(gap))} ${
                  gap > 0 ? 'short of' : 'more than'
                } the year’s ${formatPrice(yearly)}`}
          {once > 0 && typed > 0 && (
            <span className="block text-xs font-normal text-slate-500">
              New children pay {formatPrice(once)} more with installment 1.
            </span>
          )}
        </p>
      </fieldset>

      {/* ---- Pay in full ---- */}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Pay in full
        </legend>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-navy-950">
          <input
            type="checkbox"
            checked={payInFull.enabled}
            onChange={(event) => setPayInFull((p) => ({ ...p, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-navy-950/30 text-navy-900 focus:ring-navy-600"
          />
          Offer a discount for paying the whole year at once
        </label>
        {payInFull.enabled && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-600">Discount</span>
              {(['FIXED', 'PERCENT'] as const).map((kind) => (
                <label key={kind} className="flex min-h-[44px] cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name={`kind-${classLevelId}`}
                    checked={payInFull.kind === kind}
                    onChange={() => setPayInFull((p) => ({ ...p, kind }))}
                    className="h-4 w-4 border-navy-950/30 text-navy-900 focus:ring-navy-600"
                  />
                  {kind === 'FIXED' ? '₹ amount' : '% of the year'}
                </label>
              ))}
              <Input
                type="number"
                min={0}
                max={payInFull.kind === 'PERCENT' ? 100 : undefined}
                step="1"
                inputMode="numeric"
                aria-label={payInFull.kind === 'FIXED' ? 'Discount in rupees' : 'Discount percent'}
                value={payInFull.value}
                placeholder="0"
                onChange={(event) => setPayInFull((p) => ({ ...p, value: event.target.value }))}
                className="w-28"
              />
            </div>
            {yearly > 0 && (
              <p className="text-sm text-slate-600" aria-live="polite">
                Pay{' '}
                <span className="font-medium text-navy-950">
                  {formatPrice(yearly - discountOf(yearly))}
                </span>{' '}
                at once instead of {formatPrice(yearly)}
                {once > 0 && (
                  <>
                    {' '}
                    (new children {formatPrice(yearly + once - discountOf(yearly + once))} instead
                    of {formatPrice(yearly + once)})
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <PendingButton pending={pending} pendingLabel="Saving…">
        Save {standardName}
      </PendingButton>
    </KeptForm>
  );
}
