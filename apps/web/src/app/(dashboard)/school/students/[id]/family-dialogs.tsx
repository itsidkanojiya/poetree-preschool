'use client';

import { useActionState, useState } from 'react';
import { GUARDIAN_RELATIONS, type ParentSummary } from '@poetree/shared';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/form';
import { KeptForm, PendingButton } from '@/components/ui/kept-form';
import { Toast } from '@/components/ui/toast';
import { IconPlus } from '@/components/icons';
import { FamilyFields } from '../family-fields';
import { addGuardianAction, updateFamilyMemberAction, type FamilyState } from '../family-actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
    >
      Cancel
    </button>
  );
}

/** Linking a second parent — or a first, for a child who has none. */
export function LinkParentDialog({
  studentId,
  studentName,
  exclude,
  hasPrimary,
}: {
  studentId: string;
  studentName: string;
  /** Parent profiles already linked to this child. */
  exclude: string[];
  hasPrimary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FamilyState, FormData>(
    async (previous, formData) => {
      const next = await addGuardianAction(studentId, previous, formData);
      if (next.success) setOpen(false);
      return next;
    },
    {},
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-800 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        <IconPlus size={14} />
        Link a parent
      </button>
      <Toast message={state.success} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Link a parent to ${studentName}`}
        description="They can sign in to the app and see everything about this child — attendance, fees, homework and photographs."
      >
        <KeptForm action={formAction} className="space-y-5">
          <FamilyFields
            state={state}
            pending={pending}
            exclude={exclude}
            defaultRelation="FATHER"
          />

          {hasPrimary && (
            <label className="flex items-center gap-2 text-sm text-navy-950">
              <input type="checkbox" name="isPrimary" className="h-4 w-4" />
              Make them the main contact — the one the school reaches first
            </label>
          )}

          {/* With an account to use instead, the reason sits beside that offer. */}
          <FormError message={state.existingAccount ? undefined : state.error} />

          <div className="flex justify-end gap-2">
            <CancelButton onClick={() => setOpen(false)} />
            <PendingButton pending={pending} pendingLabel="Linking…">
              Link parent
            </PendingButton>
          </div>
        </KeptForm>
      </Dialog>
    </>
  );
}

/**
 * A parent's details, from their child's page. They are the parent's own —
 * every one of their children shows the same — so the window says so. The
 * relation is to this child alone.
 */
export function EditParentDialog({
  studentId,
  parent,
  parentProfileId,
  relation,
}: {
  studentId: string;
  parent: ParentSummary;
  parentProfileId: string;
  /** How they stand to this child. */
  relation: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FamilyState, FormData>(
    async (previous, formData) => {
      const next = await updateFamilyMemberAction(
        studentId,
        parent.userId,
        parentProfileId,
        relation,
        previous,
        formData,
      );
      if (next.success) setOpen(false);
      return next;
    },
    {},
  );

  const others = parent.children.filter((child) => child.id !== studentId && !child.removed);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-800 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        Edit
      </button>
      <Toast message={state.success} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${parent.name}`}
        description={
          others.length > 0
            ? `Also the parent of ${others.map((child) => child.name).join(', ')} — the change shows there too.`
            : undefined
        }
      >
        <KeptForm action={formAction} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" required maxLength={120} defaultValue={parent.name} />
            </Field>
            <Field label="Relation to this child">
              <Select name="relation" defaultValue={relation}>
                {GUARDIAN_RELATIONS.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mobile" required hint="They sign in with this.">
              <Input
                name="phone"
                type="tel"
                required
                maxLength={20}
                defaultValue={parent.phone ?? ''}
              />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" maxLength={254} defaultValue={parent.email ?? ''} />
            </Field>
            <Field label="Occupation">
              <Input name="occupation" maxLength={120} defaultValue={parent.occupation ?? ''} />
            </Field>
            <Field label="Address">
              <Input name="address" maxLength={300} defaultValue={parent.address ?? ''} />
            </Field>
          </div>

          <FormError message={state.error} />

          <div className="flex justify-end gap-2">
            <CancelButton onClick={() => setOpen(false)} />
            <PendingButton pending={pending} pendingLabel="Saving…">
              Save changes
            </PendingButton>
          </div>
        </KeptForm>
      </Dialog>
    </>
  );
}
