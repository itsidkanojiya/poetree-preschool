'use client';

import { useState } from 'react';
import type { FeePlanChoice } from '@poetree/shared';
import { FormError, Select } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import { changeFeePlanAction, type FeePlanState } from './fee-plan-actions';

/**
 * The office putting a child on a plan, or moving them to another, with what
 * that does to the bills said before it happens.
 */
export function FeePlanMover({
  studentId,
  studentName,
  choice,
}: {
  studentId: string;
  studentName: string;
  choice: FeePlanChoice;
}) {
  const others = choice.options.filter((option) => option.id !== choice.current?.planId);
  const [planId, setPlanId] = useState(others[0]?.id ?? '');
  const [state, setState] = useState<FeePlanState>({});
  // Remounts the button, which closes its dialog once the move has run.
  const [attempt, setAttempt] = useState(0);

  // After a move the plan just chosen leaves the list, so fall back to the
  // first that is left rather than holding on to it.
  const selected = others.find((option) => option.id === planId) ?? others[0];

  if (!selected) {
    return choice.current ? (
      <p className="text-xs text-slate-500">No other plan is offered to this class this year.</p>
    ) : null;
  }

  const move = async () => {
    setState(await changeFeePlanAction(studentId, choice.academicYearId, selected.id));
    setAttempt((count) => count + 1);
  };

  return (
    <div className="space-y-3 border-t border-navy-950/[0.06] pt-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-xs text-slate-500">
          {choice.current ? 'Move to' : 'Put on'}
          <Select
            value={selected.id}
            onChange={(event) => setPlanId(event.target.value)}
            className="mt-1"
          >
            {others.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.installments.length}{' '}
                {option.installments.length === 1 ? 'installment' : 'installments'})
              </option>
            ))}
          </Select>
        </label>
        <ConfirmButton
          key={attempt}
          action={move}
          label="Move to this plan"
          title={`Move ${studentName} to ${selected.name}?`}
          body="Paid and part-paid installments are kept as they are. Unpaid ones are cancelled, and the rest of the year’s fees is billed again over this plan’s installments still to come. The family sees the new installments in the app."
          confirmLabel="Move"
          className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
        />
      </div>

      <p className="text-xs text-slate-500">
        Paid and part-paid installments are kept; unpaid ones are cancelled and the remaining
        balance is billed again.
      </p>
    </div>
  );
}
