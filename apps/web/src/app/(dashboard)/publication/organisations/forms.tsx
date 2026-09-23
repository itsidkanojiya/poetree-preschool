'use client';

import { useActionState } from 'react';
import { Field, FieldSet, FormError, Input, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  createOrganisationAction,
  createOrganisationAdminAction,
  type OrganisationState,
} from './actions';

export function NewOrganisationForm() {
  const [state, formAction] = useActionState<OrganisationState, FormData>(
    createOrganisationAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <FieldSet>
        <Field label="Group name" required>
          <Input name="name" required placeholder="Sunrise Group" />
        </Field>
        <Field
          label="Group code"
          hint="Left blank, it is generated from the name. Branches are numbered under it — sunrise01, sunrise02."
        >
          <Input
            name="code"
            pattern="[a-z][a-z0-9]{2,29}"
            placeholder="generated from the name"
            className="font-mono"
          />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Creating…">Create group</SubmitButton>
    </form>
  );
}

/** The one account that can reach every branch of a group. */
export function OrganisationAdminForm({ organisationId }: { organisationId: string }) {
  const [state, formAction] = useActionState<OrganisationState, FormData>(
    createOrganisationAdminAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={organisationId} />
      <FormError message={state.error} />
      <Toast message={state.success} />

      <FieldSet>
        <Field label="Full name" required>
          <Input name="adminName" required />
        </Field>
        <Field label="Email" required>
          <Input name="adminEmail" type="email" required autoComplete="off" />
        </Field>
        <Field label="Phone">
          <Input name="adminPhone" placeholder="+91 98200 00000" />
        </Field>
        <Field label="Password" required hint="Shown once. Hand it over yourself.">
          <Input name="adminPassword" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Creating…">Create administrator</SubmitButton>
    </form>
  );
}
