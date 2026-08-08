'use client';

import { useActionState, useState } from 'react';
import type { PlanSummary, SchoolSummary } from '@poetree/shared';
import { Field, FormError, Input, Select, SubmitButton, Textarea } from '@/components/ui/form';
import {
  assignSubscriptionAction,
  createSchoolAdminAction,
  reactivateSchoolAction,
  suspendSchoolAction,
  updateSchoolAction,
  type ActionState,
} from '../actions';

function Success({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {message}
    </p>
  );
}

export function SchoolDetailsForm({ school }: { school: SchoolSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateSchoolAction.bind(null, school.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Success message={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School name">
          <Input name="name" defaultValue={school.name} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={school.city ?? ''} />
        </Field>
        <Field label="Brand colour">
          <Input
            name="primaryColor"
            type="color"
            defaultValue={school.primaryColor ?? '#2563EB'}
            className="h-10 p-1"
          />
        </Field>
      </div>

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

  const defaultExpiry = new Date();
  defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Success message={state.success} />

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
        <Input
          name="expiresAt"
          type="date"
          required
          defaultValue={defaultExpiry.toISOString().slice(0, 10)}
        />
      </Field>

      <SubmitButton pendingLabel="Assigning…">Assign plan</SubmitButton>
    </form>
  );
}

/**
 * Two-step on purpose. Suspending is not a per-school-admin inconvenience — it
 * signs out and locks out every single user of the school, so the count is put
 * in front of the Super Admin before they can confirm.
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
    <div className="space-y-4">
      <FormError message={state.error} />
      <Success message={state.success} />

      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-medium text-rose-900">
          This blocks all {impact.users} user(s) at {school.name}.
        </p>
        <p className="mt-1 text-sm text-rose-800">
          The school admin, every teacher and every parent will be signed out immediately
          {impact.activeSessions > 0 && ` (${impact.activeSessions} live session(s) ended)`} and
          will not be able to sign in again until the school is reactivated.
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Suspend this school…
        </button>
      ) : (
        <form action={formAction} className="space-y-3">
          <Field label="Reason" required hint="Recorded in the audit log against your account.">
            <Textarea name="reason" required minLength={3} placeholder="Non-payment of subscription" />
          </Field>

          <div className="flex gap-2">
            <SubmitButton variant="danger" pendingLabel="Suspending…">
              Yes, suspend and block {impact.users} user(s)
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
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
  const defaultExpiry = new Date();
  defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Success message={state.success} />

      <p className="text-sm text-slate-600">
        Reactivating restores access for everyone at {school.name}.
      </p>

      <Field
        label={expired ? 'New expiry date' : 'Extend expiry (optional)'}
        required={expired}
        hint={
          expired
            ? 'This plan has already lapsed, so a new date is required — otherwise it would block again on the next request.'
            : undefined
        }
      >
        <Input
          name="expiresAt"
          type="date"
          required={expired}
          defaultValue={expired ? defaultExpiry.toISOString().slice(0, 10) : ''}
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
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Success message={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
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
          hint="At least 8 characters with a letter and a number."
        >
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Creating…">Create administrator</SubmitButton>
    </form>
  );
}
