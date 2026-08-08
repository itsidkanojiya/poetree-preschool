'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';
import { createSchoolAction, type ActionState } from '../actions';

export function NewSchoolForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createSchoolAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School name" required>
          <Input name="name" required placeholder="Sunrise Preschool" />
        </Field>

        <Field
          label="School code"
          required
          hint="Permanent. Lowercase letters and digits only — it becomes the school’s app id later."
        >
          <Input
            name="code"
            required
            pattern="[a-z][a-z0-9]{2,29}"
            placeholder="sunrise"
            className="font-mono"
          />
        </Field>

        <Field label="Contact email">
          <Input name="email" type="email" placeholder="office@sunrise.edu" />
        </Field>

        <Field label="Contact phone">
          <Input name="phone" placeholder="+91 98200 00000" />
        </Field>

        <Field label="Principal">
          <Input name="principalName" />
        </Field>

        <Field label="Brand colour" hint="Used on the school’s app in Phase 2.">
          <Input name="primaryColor" type="color" defaultValue="#2563EB" className="h-10 p-1" />
        </Field>

        <Field label="Address">
          <Input name="addressLine1" />
        </Field>

        <Field label="City">
          <Input name="city" />
        </Field>

        <Field label="State">
          <Input name="state" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Creating…">Create school</SubmitButton>
    </form>
  );
}
