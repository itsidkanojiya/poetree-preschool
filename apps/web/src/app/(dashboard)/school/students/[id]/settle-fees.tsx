'use client';

import { useActionState, useState } from 'react';
import { Button, Field, FormError, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/dialog';
import { PendingButton } from '@/components/ui/kept-form';
import { formatPrice } from '@/lib/format';
import { settleFeesAction, type FeePlanState } from './fee-plan-actions';

const METHODS = [
  ['CASH', 'Cash'],
  ['CHEQUE', 'Cheque'],
  ['BANK_TRANSFER', 'Bank transfer'],
  ['UPI', 'UPI'],
] as const;

/**
 * Mark as fully paid: the office types what it received, and the rest of the
 * year is closed. Pre-filled with what the year asks for now — the discounted
 * full-year amount when nothing has been paid and the standard offers it.
 */
export function SettleFees({
  studentId,
  studentName,
  suggestedInPaise,
  discountInPaise,
  today,
}: {
  studentId: string;
  studentName: string;
  suggestedInPaise: number;
  /** The pay-in-full discount that will be given, when it applies. */
  discountInPaise: number;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FeePlanState, FormData>(
    async (prev, formData) => {
      const next = await settleFeesAction(studentId, prev, formData);
      if (next.done) setOpen(false);
      return next;
    },
    {},
  );

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Mark as fully paid
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Mark ${studentName}’s fees as fully paid?`}
        description="Records the money received with a receipt, and closes every installment still open this year. No more reminders are sent."
      >
        <form action={formAction} className="space-y-4">
          <FormError message={state.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount received (₹)"
              required
              hint={
                discountInPaise > 0
                  ? `Includes the ${formatPrice(discountInPaise)} pay-in-full discount`
                  : undefined
              }
            >
              <Input
                name="amount"
                type="number"
                min={1}
                step="1"
                inputMode="numeric"
                defaultValue={suggestedInPaise / 100}
              />
            </Field>
            <Field label="Paid on" required>
              <Input name="paidOn" type="date" defaultValue={today} max={today} />
            </Field>
            <Field label="How">
              <Select name="method" defaultValue="CASH">
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" hint="Cheque or UTR number, if any">
              <Input name="reference" maxLength={80} autoComplete="off" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <PendingButton pending={pending} pendingLabel="Saving…">
              Mark as fully paid
            </PendingButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
