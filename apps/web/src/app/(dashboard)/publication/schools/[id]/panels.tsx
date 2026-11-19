'use client';

import { useActionState, useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
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
  setSchoolValidityAction,
  updateSchoolAction,
  uploadSchoolLogoAction,
  removeSchoolLogoAction,
  deleteSchoolAction,
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
        <Field
          label="Brand colour"
          hint="Their app and portal take this colour from here, at sign-in."
        >
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

/**
 * The school's badge.
 *
 * Shown on their app's sign-in screen, which is a screen nobody is signed in
 * to — so this is served publicly by school code, and a stranger who knows the
 * code can see it. That is the same as walking past the gate.
 *
 * Save works only once a picture is chosen, and taking the logo away is its
 * own button: pressing Save with nothing chosen used to remove the logo.
 */
export function LogoPanel({ school }: { school: SchoolSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    uploadSchoolLogoAction.bind(null, school.id),
    {},
  );
  const [removed, removeAction] = useActionState<ActionState, FormData>(
    removeSchoolLogoAction.bind(null, school.id),
    {},
  );
  const [chosen, setChosen] = useState(false);

  // The form empties itself after a save; the button follows it.
  useEffect(() => {
    if (state.success) setChosen(false);
  }, [state]);

  return (
    <div className="space-y-4">
      <FormError message={state.error ?? removed.error} />
      <FormSuccess message={state.success ?? removed.success} />

      <div className="flex items-center gap-4">
        {school.logoUrl ? (
          /* A plain img: next/image wants known dimensions and a loader
             configured for the host, and this is one small picture served
             from our own API. */
          <img
            src={school.logoUrl}
            alt={`${school.name} logo`}
            className="h-16 w-16 shrink-0 rounded-xl object-contain ring-1 ring-navy-950/10"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-navy-50 font-display text-xl font-extrabold text-navy-800 ring-1 ring-navy-950/10"
          >
            {initialsOf(school.name)}
          </span>
        )}
        <p className="text-sm text-slate-600">
          {school.logoUrl
            ? 'This is what families see when they open the app.'
            : 'No logo yet. The app shows the school’s initials instead.'}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field
          label={school.logoUrl ? 'Replace it with' : 'Upload a logo'}
          hint="PNG, JPEG or WebP. Square works best."
        >
          <Input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setChosen(Boolean(event.currentTarget.files?.length))}
            className="file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-900"
          />
        </Field>
        <SubmitButton disabled={!chosen} pendingLabel="Saving…">
          Save logo
        </SubmitButton>
      </form>

      {school.logoUrl && (
        <form action={removeAction} className="border-t border-navy-950/[0.06] pt-4">
          <SubmitButton variant="secondary" pendingLabel="Removing…">
            Remove logo
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

/** Up to two letters from the name, for the badge stand-in. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => /^[A-Za-z]/.test(word))
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join('') || 'S'
  );
}

/**
 * The one lever: a date.
 *
 * Everything else about access follows from it — past means locked out,
 * future means in, and extending an expired school brings them back without
 * anybody having to know to press reactivate as well.
 */
export function ValidityPanel({ school }: { school: SchoolSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setSchoolValidityAction.bind(null, school.id),
    {},
  );

  const current = school.validUntil ? school.validUntil.slice(0, 10) : '';
  const lapsed = school.validUntil !== null && new Date(school.validUntil).getTime() <= Date.now();

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {lapsed && (
        <Notice tone="warning" title="This date has passed">
          Nobody at this school can sign in. Set a later date to let them back in.
        </Notice>
      )}

      <Field
        label="Access ends"
        hint="Leave it blank for no end date. When the date passes, everybody at the school is signed out."
      >
        <Input name="validUntil" type="date" defaultValue={current} />
      </Field>

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save end date
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
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-300 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <IconBan size={17} aria-hidden="true" />
          Suspend this school…
        </button>
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
        <Notice tone="warning" title="Their access date has passed.">
          Give a new end date — without one they would be blocked again straight away.
        </Notice>
      )}

      <p className="text-sm text-slate-600">
        Reactivating restores access for everyone at {school.name}.
      </p>

      <Field label={expired ? 'New end date' : 'New end date (optional)'} required={expired}>
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
          <Input
            name="password"
            type="text"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,72}"
            title="At least 8 characters, with a letter and a number"
            autoComplete="off"
          />
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

/**
 * Deleting the school, for good: every child, every attendance mark, fee and
 * report card, every account and every file. The window says what goes, and
 * the button only works once the School ID is typed back — a deliberate act,
 * not a slip of the pointer.
 */
export function DeleteSchoolPanel({
  school,
}: {
  school: SchoolSummary;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteSchoolAction.bind(null, school.id),
    {},
  );
  const matches = typed.trim().toLowerCase() === school.code.toLowerCase();

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Erases {school.name} and everything in it. This cannot be undone. To stop them using the
        product but keep their records, suspend them on the Access tab instead.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-300 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
      >
        Delete school permanently
      </button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped('');
        }}
        title={`Delete ${school.name} permanently?`}
        description="Everything in this school is erased at once, and it cannot be brought back."
      >
        <form action={formAction} className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>
              {school.counts.students} {school.counts.students === 1 ? 'child' : 'children'}, with
              their attendance, fees, homework, report cards and certificates
            </li>
            <li>
              {school.counts.users} {school.counts.users === 1 ? 'account' : 'accounts'} —
              administrators, {school.counts.teachers}{' '}
              {school.counts.teachers === 1 ? 'teacher' : 'teachers'} and parents — who can no
              longer sign in
            </li>
            <li>Classes, timetable, announcements, gallery, uploaded files and registrations</li>
          </ul>

          <label className="block text-sm text-navy-950">
            <span className="mb-1.5 block font-medium">
              Type the School ID, <span className="font-mono">{school.code}</span>, to confirm
            </span>
            <input
              name="confirmCode"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border-0 px-3.5 py-2.5 font-mono text-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-rose-600"
            />
          </label>

          {state.error && (
            <p role="alert" className="text-sm font-medium text-rose-700">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
            >
              Keep the school
            </button>
            <button
              type="submit"
              disabled={!matches || pending}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
            >
              {pending ? 'Deleting…' : 'Delete for good'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
