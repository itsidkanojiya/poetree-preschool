'use client';

import { useActionState, useState } from 'react';
import type { PlanSummary, SchoolSummary } from '@poetree/shared';
import {
  Button,
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { IconAlert, IconBan } from '@/components/icons';
import {
  assignSubscriptionAction,
  createSchoolAdminAction,
  reactivateSchoolAction,
  suspendSchoolAction,
  updateSchoolAction,
  type ActionState,
} from '../actions';

function oneYearOut(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function SchoolDetailsForm({ school }: { school: SchoolSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateSchoolAction.bind(null, school.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="School name">
          <Input name="name" defaultValue={school.name} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={school.city ?? ''} />
        </Field>
        <Field label="Brand colour" hint="Used on the school's app in Phase 2.">
          <Input
            name="primaryColor"
            type="color"
            defaultValue={school.primaryColor ?? '#16307C'}
            className="h-11 px-1.5 py-1"
          />
        </Field>
      </FieldSet>

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save details
      </SubmitButton>
    </form>
  );
}

export function AssignPlanPanel({
  school,
  plans,
}: {
  school: SchoolSummary;
  plans: PlanSummary[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    assignSubscriptionAction.bind(null, school.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="Plan" required>
        <Select name="planId" required defaultValue="">
          <option value="" disabled>
            Choose a plan
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {plan.maxStudents ?? 'unlimited'} students
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Expires on" required hint="Access is cut automatically after this date.">
        <Input name="expiresAt" type="date" required defaultValue={oneYearOut()} />
      </Field>

      <SubmitButton pendingLabel="Assigning…">Assign plan</SubmitButton>
    </form>
  );
}

/**
 * Two-step on purpose. Suspending is not a per-admin inconvenience — it signs
 * out and locks out every user of the school, so the count goes in front of the
 * Super Admin before they can confirm.
 */
export function SuspendPanel({
  school,
  impact,
}: {
  school: SchoolSummary;
  impact: { users: number; activeSessions: number };
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    suspendSchoolAction.bind(null, school.id),
    {},
  );

  return (
    <div className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Notice tone="danger" title={`This blocks all ${impact.users} users at ${school.name}.`}>
        The school admin, every teacher and every parent is signed out immediately
        {impact.activeSessions > 0 && ` (${impact.activeSessions} live session${impact.activeSessions === 1 ? '' : 's'} ended)`}{' '}
        and cannot sign in again until the school is reactivated.
      </Notice>

      {!confirming ? (
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          <IconBan size={17} />
          Suspend this school…
        </Button>
      ) : (
        <form action={formAction} className="space-y-4">
          <Field label="Reason" required hint="Recorded in the audit log against your account.">
            <Textarea
              name="reason"
              required
              minLength={3}
              placeholder="Non-payment of subscription"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Suspending…">
              Yes, block {impact.users} user{impact.users === 1 ? '' : 's'}
            </SubmitButton>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ReactivatePanel({ school }: { school: SchoolSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    reactivateSchoolAction.bind(null, school.id),
    {},
  );

  const expired = school.status === 'EXPIRED';

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {expired && (
        <Notice tone="warning" title="This plan has already lapsed.">
          A new expiry date is required — without one it would block again on the next request.
        </Notice>
      )}

      <p className="text-sm text-slate-600">
        Reactivating restores access for everyone at {school.name}.
      </p>

      <Field label={expired ? 'New expiry date' : 'Extend expiry (optional)'} required={expired}>
        <Input
          name="expiresAt"
          type="date"
          required={expired}
          defaultValue={expired ? oneYearOut() : ''}
        />
      </Field>

      <Field label="Note">
        <Input name="note" placeholder="Payment received" />
      </Field>

      <SubmitButton pendingLabel="Reactivating…">Reactivate school</SubmitButton>
    </form>
  );
}

export function CreateAdminPanel({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createSchoolAdminAction.bind(null, schoolId),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Full name" required>
          <Input name="name" required />
        </Field>
        <Field label="Email" required>
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Phone">
          <Input name="phone" />
        </Field>
        <Field
          label="Temporary password"
          required
          hint="At least 8 characters, with a letter and a number."
        >
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </FieldSet>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <IconAlert size={14} className="mt-0.5 shrink-0" />
        Share this password securely, and have them change it after first sign-in.
      </p>

      <SubmitButton pendingLabel="Creating…">Create administrator</SubmitButton>
    </form>
  );
}
