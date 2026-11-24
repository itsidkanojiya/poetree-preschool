'use client';

import { useActionState, useState } from 'react';
import type { PaymentDetailsView } from '@poetree/shared';
import { Field, FormError, Input } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { Toast } from '@/components/ui/toast';
import { savePaymentDetailsAction, type PaymentDetailsState } from './actions';

/**
 * The school's bank account and UPI ID. Each is switched on separately, and
 * a family is shown only what is on.
 */
export function PaymentDetailsForm({ saved }: { saved: PaymentDetailsView }) {
  const [state, formAction, pending] = useActionState<PaymentDetailsState, FormData>(
    savePaymentDetailsAction,
    {},
  );
  const [bank, setBank] = useState(saved.bankEnabled);
  const [upi, setUpi] = useState(saved.upiEnabled);

  const toggle = (
    name: string,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
  ) => (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-base font-semibold text-navy-950">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-navy-950/30 text-navy-900 focus:ring-navy-600"
      />
      {label}
    </label>
  );

  return (
    <KeptForm action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <section className="space-y-3">
        {toggle('upiEnabled', 'UPI', upi, setUpi)}
        {/* Hidden, not removed, while switched off: the details are kept. */}
        <div className={upi ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <Field label="UPI ID" required hint="Like school@okhdfc">
            <Input
              name="upiId"
              defaultValue={saved.upiId ?? ''}
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field label="Name families see" hint="The name the UPI app shows when they pay">
            <Input name="upiName" defaultValue={saved.upiName ?? ''} maxLength={120} />
          </Field>
        </div>
      </section>

      <section className="space-y-3 border-t border-navy-950/[0.06] pt-5">
        {toggle('bankEnabled', 'Bank transfer', bank, setBank)}
        {/* Hidden, not removed, while switched off: the details are kept. */}
        <div className={bank ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <Field label="Account name">
            <Input
              name="bankAccountName"
              defaultValue={saved.bankAccountName ?? ''}
              maxLength={120}
            />
          </Field>
          <Field label="Account number" required>
            <Input
              name="bankAccountNo"
              defaultValue={saved.bankAccountNo ?? ''}
              maxLength={40}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field label="IFSC" required hint="11 characters, like HDFC0001234">
            <Input
              name="bankIfsc"
              defaultValue={saved.bankIfsc ?? ''}
              maxLength={11}
              autoComplete="off"
              className="uppercase"
            />
          </Field>
          <Field label="Bank and branch">
            <Input name="bankName" defaultValue={saved.bankName ?? ''} maxLength={120} />
          </Field>
        </div>
      </section>

      <PendingButton pending={pending} pendingLabel="Saving…">
        Save
      </PendingButton>
    </KeptForm>
  );
}
