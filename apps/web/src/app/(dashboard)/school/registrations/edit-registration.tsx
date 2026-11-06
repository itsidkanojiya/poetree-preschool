'use client';

import { useActionState, useState } from 'react';
import type { RegistrationSummary } from '@poetree/shared';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { Toast } from '@/components/ui/toast';
import { IconCheck } from '@/components/icons';
import { updateRegistrationAction, type RegistrationState } from './actions';

/** What was proved with a code, shown so the office knows it is not theirs to change. */
function Proved({
  label,
  value,
  verified = true,
}: {
  label: string;
  value: string | null;
  verified?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="flex items-center gap-1 text-sm text-navy-950">
        {value}
        {verified && <IconCheck size={12} strokeWidth={2.5} className="text-leaf-700" />}
      </dd>
    </div>
  );
}

/**
 * Correcting a family's request before it is verified.
 *
 * Parents misspell names on a phone keyboard and pick the wrong birthday from a
 * date wheel; the office would rather fix that here than turn the family down
 * and ask them to start again. Once verified or turned down, the request is
 * locked and this button is gone — the child is edited on their own page.
 */
export function EditRegistration({
  registration,
  classLevels,
}: {
  registration: RegistrationSummary;
  classLevels: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RegistrationState, FormData>(
    async (previous, formData) => {
      const next = await updateRegistrationAction(registration.id, previous, formData);
      if (next.success) setOpen(false);
      return next;
    },
    {},
  );

  const row = registration;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-800 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Edit details
      </button>
      <Toast message={state.success} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Correct ${row.studentName}’s registration`}
        description="Waiting to be verified, so the office can still correct it. Every change is recorded. Once you approve or turn it down, it is locked."
      >
        <KeptForm action={formAction} className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-navy-950">The child</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" required>
                <Input
                  name="studentFirstName"
                  required
                  maxLength={60}
                  // Rows from before the form split the name have only the
                  // whole of it; the first box takes that.
                  defaultValue={row.studentFirstName ?? row.studentName}
                />
              </Field>
              <Field label="Middle name">
                <Input
                  name="studentMiddleName"
                  maxLength={60}
                  defaultValue={row.studentMiddleName ?? ''}
                />
              </Field>
              <Field label="Last name">
                <Input
                  name="studentLastName"
                  maxLength={60}
                  defaultValue={row.studentLastName ?? ''}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date of birth" required={Boolean(row.studentDateOfBirth)}>
                <Input
                  type="date"
                  name="studentDateOfBirth"
                  required={Boolean(row.studentDateOfBirth)}
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={row.studentDateOfBirth?.slice(0, 10) ?? ''}
                />
              </Field>
              <Field label="Standard">
                <Select name="classLevelId" defaultValue={row.classLevel?.id ?? ''}>
                  <option value="">Not given</option>
                  {classLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Blood group">
                <Input name="bloodGroup" maxLength={8} defaultValue={row.bloodGroup ?? ''} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-navy-950">The family</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Parent’s name" required hint="The person who registered.">
                <Input
                  name="guardianName"
                  required
                  maxLength={120}
                  defaultValue={row.guardianName}
                />
              </Field>
              <Field label="Father’s name">
                <Input name="fatherName" maxLength={120} defaultValue={row.fatherName ?? ''} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Second contact">
                <Select name="secondContactRelation" defaultValue={row.secondContactRelation}>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                </Select>
              </Field>
              <Field label="Their name">
                <Input name="motherName" maxLength={120} defaultValue={row.motherName ?? ''} />
              </Field>
              <Field label="Their email">
                <Input
                  type="email"
                  name="motherEmail"
                  maxLength={254}
                  defaultValue={row.motherEmail ?? ''}
                />
              </Field>
            </div>
            <Field label="Address">
              <Textarea name="address" rows={2} maxLength={300} defaultValue={row.address ?? ''} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Emergency contact">
                <Input
                  name="emergencyContactName"
                  maxLength={120}
                  defaultValue={row.emergencyContactName ?? ''}
                />
              </Field>
              <Field label="Emergency phone">
                <Input
                  type="tel"
                  name="emergencyContactPhone"
                  maxLength={20}
                  placeholder="+91…"
                  defaultValue={row.emergencyContactPhone ?? ''}
                />
              </Field>
            </div>
          </fieldset>

          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-navy-950/[0.06]">
            <p className="text-sm font-medium text-navy-950">Proved with a code</p>
            <p className="mt-0.5 text-xs text-slate-500">
              The family confirmed these with a code sent to them, so they cannot be changed here.
              If one is wrong, turn the request down and ask the family to register again.
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <Proved label="Mobile" value={row.phone} />
              <Proved label="Email" value={row.email} />
              <Proved
                label={
                  row.secondContactRelation === 'MOTHER' ? 'Mother’s mobile' : 'Guardian’s mobile'
                }
                value={row.motherPhone}
                verified={row.motherPhoneVerified}
              />
            </dl>
          </div>

          <FormError message={state.error} />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
            >
              Cancel
            </button>
            <PendingButton pending={pending} pendingLabel="Saving…">
              Save changes
            </PendingButton>
          </div>
        </KeptForm>
      </Dialog>
    </>
  );
}
