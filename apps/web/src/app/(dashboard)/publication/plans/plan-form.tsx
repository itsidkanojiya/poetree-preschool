'use client';

import { useActionState } from 'react';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  SubmitButton,
  Textarea,
} from '@/components/ui/form';
import type { ActionState } from '../schools/actions';
import { createPlanAction } from './actions';

export function NewPlanForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createPlanAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet legend="Identity">
        <Field label="Plan name" required>
          <Input name="name" required placeholder="Premium" />
        </Field>
        <Field label="Code" required hint="Uppercase, permanent.">
          <Input
            name="code"
            required
            pattern="[A-Z][A-Z0-9_]{2,29}"
            placeholder="PREMIUM"
            className="font-mono"
          />
        </Field>
      </FieldSet>

      <FieldSet legend="Limits and price">
        <Field label="Max students" hint="Leave blank for unlimited.">
          <Input name="maxStudents" type="number" min={1} placeholder="Unlimited" />
        </Field>
        <Field label="Max teachers" hint="Leave blank for unlimited.">
          <Input name="maxTeachers" type="number" min={1} placeholder="Unlimited" />
        </Field>
        <Field label="Price (₹)">
          <Input name="priceInRupees" type="number" min={0} step={1} defaultValue={0} />
        </Field>
        <Field label="Billing period (months)">
          <Input name="billingPeriodMonths" type="number" min={1} defaultValue={12} />
        </Field>
      </FieldSet>

      <div className="space-y-4">
        <Field label="Description">
          <Textarea name="description" placeholder="For established preschools with several sections." />
        </Field>
        <Field label="Features" hint="Comma separated.">
          <Input name="features" placeholder="Student management, Attendance, Reports" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Creating…">Create plan</SubmitButton>
    </form>
  );
}
