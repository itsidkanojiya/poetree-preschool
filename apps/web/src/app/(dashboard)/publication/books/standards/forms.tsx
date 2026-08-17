'use client';

import { useActionState } from 'react';
import type { StandardSummary } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  SubmitButton,
} from '@/components/ui/form';
import { LiveSwitch } from '@/components/ui/live-switch';
import {
  createStandardAction,
  renameStandardAction,
  setStandardActiveAction,
  type StandardState,
} from './actions';

export function NewStandardForm() {
  const [state, formAction] = useActionState<StandardState, FormData>(createStandardAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="Name" required hint="What a parent and a teacher will read.">
        <Input name="name" required placeholder="Toddler" />
      </Field>

      <SubmitButton pendingLabel="Adding…">Add standard</SubmitButton>
    </form>
  );
}

/**
 * Everything about a standard that can change.
 *
 * The code cannot: fee structures refer to it, and an import file naming a code
 * that moved would file children into the wrong year.
 */
export function StandardDetailsForm({ standard }: { standard: StandardSummary }) {
  const [state, formAction] = useActionState<StandardState, FormData>(
    renameStandardAction.bind(null, standard.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Name" required hint="What a parent and a teacher will read.">
          <Input name="name" required defaultValue={standard.name} />
        </Field>
        <Field label="Code" hint="Chosen when it was added, and fixed.">
          <Input value={standard.code} disabled readOnly className="font-mono" />
        </Field>
      </FieldSet>

      <Field
        label="Order"
        hint="Where this year sits among the others — the order every list of standards is drawn in."
      >
        <Input name="sortOrder" type="number" min={0} max={100} defaultValue={standard.sortOrder} />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

export function StandardLiveSwitch({ standard }: { standard: StandardSummary }) {
  return (
    <LiveSwitch
      on={standard.isActive}
      action={setStandardActiveAction.bind(null, standard.id, !standard.isActive)}
      label={
        standard.isActive
          ? `Stop offering ${standard.name}`
          : `Offer ${standard.name} again`
      }
      onTitle="Offered"
      offTitle="Not offered"
      onNote="Schools can open a new class in this year, and books can be written for it."
      offNote="No school can open a new class in this year. Classes already in it carry on exactly as they are, and nothing filed against them is lost."
      // Refused server-side while classes are in it, so the reason is shown
      // rather than the control hidden — a control that does nothing with no
      // reason given is worse than an answer.
      blockedReason={
        standard.classroomCount > 0
          ? `${standard.classroomCount} ${
              standard.classroomCount === 1 ? 'class is' : 'classes are'
            } in this standard, so this will be refused until they move.`
          : undefined
      }
    />
  );
}
