'use client';

import { useActionState, useState } from 'react';
import { GENDERS, type StudentSummary } from '@poetree/shared';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { Toast } from '@/components/ui/toast';
import { formatDate, toInputDate } from '@/lib/format';
import { updateStudentAction, type DocumentState } from './actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Everything about a child the office keeps, in one window.
 *
 * A verified child is still editable — the school chose that, because a
 * verified record still needs correcting when a family moves — but the window
 * says it is verified and that the change will be recorded, so nobody edits
 * one thinking it leaves no trace.
 */
export function EditStudent({
  student,
  classrooms,
}: {
  student: StudentSummary;
  /** This year's sections, and the child's own if it is not one of them. */
  classrooms: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    async (previous, formData) => {
      const next = await updateStudentAction(student.id, previous, formData);
      if (next.success) setOpen(false);
      return next;
    },
    {},
  );

  const verification = student.verification;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800"
      >
        Edit details
      </button>
      <Toast message={state.success} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${student.fullName}`}
        description={
          verification ? (
            <>
              Verified {formatDate(verification.verifiedAt)}
              {verification.verifiedBy && <> by {verification.verifiedBy}</>}. You can still change
              anything here; each change is recorded with what it was and what it became.
            </>
          ) : (
            'Each change is recorded with what it was and what it became.'
          )
        }
      >
        <KeptForm action={formAction} className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-navy-950">The child</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" required>
                <Input name="firstName" required maxLength={60} defaultValue={student.firstName} />
              </Field>
              <Field label="Middle name" hint="The father’s given name.">
                <Input name="middleName" maxLength={60} defaultValue={student.middleName ?? ''} />
              </Field>
              <Field label="Last name">
                <Input name="lastName" maxLength={60} defaultValue={student.lastName ?? ''} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date of birth" required>
                <Input
                  type="date"
                  name="dateOfBirth"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={toInputDate(student.dateOfBirth)}
                />
              </Field>
              <Field label="Gender" required>
                <Select name="gender" required defaultValue={student.gender}>
                  {GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {titleCase(gender)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Blood group">
                <Input name="bloodGroup" maxLength={8} defaultValue={student.bloodGroup ?? ''} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field
                  label="Class"
                  hint={
                    student.classroom
                      ? 'Moves them to another section. To take them off the roll, use Remove.'
                      : undefined
                  }
                >
                  <Select name="classroomId" defaultValue={student.classroom?.id ?? ''}>
                    {!student.classroom && <option value="">No class yet</option>}
                    {classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Roll no.">
                <Input name="rollNo" maxLength={20} defaultValue={student.rollNo ?? ''} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-navy-950">Home</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address">
                <Input
                  name="addressLine1"
                  maxLength={200}
                  defaultValue={student.addressLine1 ?? ''}
                />
              </Field>
              <Field label="Address, second line">
                <Input
                  name="addressLine2"
                  maxLength={200}
                  defaultValue={student.addressLine2 ?? ''}
                />
              </Field>
              <Field label="City">
                <Input name="city" maxLength={100} defaultValue={student.city ?? ''} />
              </Field>
              <Field label="PIN code">
                <Input name="postalCode" maxLength={20} defaultValue={student.postalCode ?? ''} />
              </Field>
              <Field label="Emergency contact">
                <Input
                  name="emergencyContactName"
                  maxLength={120}
                  defaultValue={student.emergencyContactName ?? ''}
                />
              </Field>
              <Field label="Emergency phone">
                <Input
                  type="tel"
                  name="emergencyContactPhone"
                  maxLength={20}
                  placeholder="+91…"
                  defaultValue={student.emergencyContactPhone ?? ''}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-navy-950">Health</legend>
            <Field label="Allergies">
              <Textarea
                name="allergies"
                rows={2}
                maxLength={2000}
                defaultValue={student.allergies ?? ''}
              />
            </Field>
            <Field label="Medical notes">
              <Textarea
                name="medicalNotes"
                rows={3}
                maxLength={2000}
                defaultValue={student.medicalNotes ?? ''}
              />
            </Field>
          </fieldset>

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
