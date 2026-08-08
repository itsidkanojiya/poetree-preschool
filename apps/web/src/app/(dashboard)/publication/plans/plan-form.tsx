'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, SubmitButton, Textarea } from '@/components/ui/form';
import type { ActionState } from '../schools/actions';
import { createPlanAction } from './actions';

export function NewPlanForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createPlanAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      {state.success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" required>
          <Input name="name" required placeholder="Premium" />
        </Field>
        <Field label="Code" required hint="Uppercase, permanent.">
          <Input name="code" required pattern="[A-Z][A-Z0-9_]{2,29}" placeholder="PREMIUM" className="font-mono" />
        </Field>
        <Field label="Max students" hint="Leave blank for unlimited.">
          <Input name="maxStudents" type="number" min={1} />
        </Field>
        <Field label="Max teachers" hint="Leave blank for unlimited.">
          <Input name="maxTeachers" type="number" min={1} />
        </Field>
        <Field label="Price (₹)">
          <Input name="priceInRupees" type="number" min={0} step={1} defaultValue={0} />
        </Field>
        <Field label="Billing period (months)">
          <Input name="billingPeriodMonths" type="number" min={1} defaultValue={12} />
        </Field>
      </div>

      <Field label="Description">
        <Textarea name="description" />
      </Field>

      <Field label="Features" hint="Comma separated.">
        <Input name="features" placeholder="Student management, Attendance, Reports" />
      </Field>

      <SubmitButton pendingLabel="Creating…">Create plan</SubmitButton>
    </form>
  );
}
