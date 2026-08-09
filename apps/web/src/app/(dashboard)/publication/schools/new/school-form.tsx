'use client';

import { useActionState } from 'react';
import { Field, FieldSet, FormError, Input, SubmitButton } from '@/components/ui/form';
import { createSchoolAction, type ActionState } from '../actions';

export function NewSchoolForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createSchoolAction, {});

  return (
    <form action={formAction} className="space-y-7">
      <FormError message={state.error} />

      <FieldSet legend="Identity">
        <Field label="School name" required>
          <Input name="name" required placeholder="Sunrise Preschool" />
        </Field>

        <Field
          label="School code"
          required
          hint="Permanent. Lowercase letters and digits only — it becomes the school's app id in Phase 2."
        >
          <Input
            name="code"
            required
            pattern="[a-z][a-z0-9]{2,29}"
            placeholder="sunrise"
            className="font-mono"
          />
        </Field>
      </FieldSet>

      <FieldSet legend="Contact">
        <Field label="Email">
          <Input name="email" type="email" placeholder="office@sunrise.edu" />
        </Field>
        <Field label="Phone">
          <Input name="phone" placeholder="+91 98200 00000" />
        </Field>
        <Field label="Principal">
          <Input name="principalName" />
        </Field>
        <Field label="Brand colour" hint="Used on the school's app in Phase 2.">
          <Input name="primaryColor" type="color" defaultValue="#16307C" className="h-11 px-1.5 py-1" />
        </Field>
      </FieldSet>

      <FieldSet legend="Address">
        <Field label="Street">
          <Input name="addressLine1" />
        </Field>
        <Field label="City">
          <Input name="city" />
        </Field>
        <Field label="State">
          <Input name="state" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Creating…">Create school</SubmitButton>
    </form>
  );
}
