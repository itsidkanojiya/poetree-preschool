'use client';

import { useActionState, useState } from 'react';
import { FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/format';
import { addFeeHeadAction, saveStructureAction, type StructureState } from './actions';
import { FREQUENCIES, type FrequencyValue } from './frequencies';

export interface HeadOption {
  id: string;
  name: string;
}

/** One fee head's amount and how often, as the structure holds it now. */
export interface SavedItem {
  amountInPaise: number;
  frequency: FrequencyValue;
}

/** Adds a kind of fee — Tuition, Admission, Transport — for every standard to use. */
export function AddHeadForm() {
  const [state, formAction] = useActionState<StructureState, FormData>(addFeeHeadAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <Toast message={state.success} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="mb-1.5 block text-sm font-medium text-navy-950">New fee</span>
          <Input
            name="headName"
            placeholder="e.g. Admission, Transport, Annual charges"
            maxLength={80}
          />
        </label>
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add head
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * What one standard pays: each fee head's amount and how often. The year's
 * total and the one-time admission amount add up live, so the office sees
 * what a family will be asked for before saving.
 */
export function StructureForm({
  academicYearId,
  classLevelId,
  standardName,
  heads,
  saved,
}: {
  academicYearId: string;
  classLevelId: string;
  standardName: string;
  heads: HeadOption[];
  saved: Record<string, SavedItem>;
}) {
  const [state, formAction] = useActionState<StructureState, FormData>(
    saveStructureAction.bind(null, academicYearId, classLevelId, standardName),
    {},
  );
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      heads.map((head) => [
        head.id,
        {
          rupees: saved[head.id] ? String(saved[head.id]!.amountInPaise / 100) : '',
          frequency: (saved[head.id]?.frequency ?? 'ANNUAL') as FrequencyValue,
        },
      ]),
    ),
  );

  const perYear = (frequency: FrequencyValue) =>
    FREQUENCIES.find((f) => f.value === frequency)!.perYear;
  let yearly = 0;
  let once = 0;
  for (const head of heads) {
    const row = rows[head.id]!;
    const paise = Math.round((Number(row.rupees) || 0) * 100);
    if (row.frequency === 'ONE_TIME') once += paise;
    else yearly += paise * perYear(row.frequency);
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400">
              <th scope="col" className="pb-2 font-semibold">
                Fee
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Amount (₹)
              </th>
              <th scope="col" className="pb-2 font-semibold">
                How often
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-950/[0.06]">
            {heads.map((head) => {
              const row = rows[head.id]!;
              return (
                <tr key={head.id}>
                  <td className="py-2 pr-3 font-medium text-navy-950">{head.name}</td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      name={`amount-${head.id}`}
                      aria-label={`${head.name} amount for ${standardName}`}
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
                  </td>
                  <td className="py-2">
                    <Select
                      name={`frequency-${head.id}`}
                      aria-label={`How often ${head.name} is charged for ${standardName}`}
                      value={row.frequency}
                      onChange={(event) =>
                        setRows((all) => ({
                          ...all,
                          [head.id]: { ...row, frequency: event.target.value as FrequencyValue },
                        }))
                      }
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600" aria-live="polite">
        <span className="font-medium text-navy-950">{formatPrice(yearly)} a year</span>
        {once > 0 && <> · plus {formatPrice(once)} once, for children new to the school</>}
        <span className="block text-xs text-slate-500">
          Leave a fee at 0 if this standard does not pay it.
        </span>
      </p>

      <SubmitButton pendingLabel="Saving…">Save {standardName} fees</SubmitButton>
    </form>
  );
}
