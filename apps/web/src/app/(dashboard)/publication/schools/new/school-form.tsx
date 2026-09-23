'use client';

import { useActionState } from 'react';
import type { OrganisationSummary } from '@poetree/shared';
import { Field, FieldSet, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { createSchoolAction, type ActionState } from '../actions';

export function NewSchoolForm({ organisations }: { organisations: OrganisationSummary[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSchoolAction, {});

  return (
    <form action={formAction} className="space-y-7">
      <FormError message={state.error} />

      <FieldSet legend="Identity">
        <Field label="School name" required>
          <Input name="name" required placeholder="Sunrise Preschool" />
        </Field>

        {organisations.length > 0 && (
          <Field
            label="Group"
            hint="A branch of a group, or a school on its own. Branches are numbered under the group's code."
          >
            <Select name="organisationId" defaultValue="">
              <option value="">Independent school</option>
              {organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name} ({organisation.code})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="School code"
          hint="Left blank, it is generated from the name — sunrisepreschool, or sunrise01 for a branch. Permanent either way: it becomes the school's app id."
        >
          <Input
            name="code"
            pattern="[a-z][a-z0-9]{2,29}"
            placeholder="generated from the name"
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
