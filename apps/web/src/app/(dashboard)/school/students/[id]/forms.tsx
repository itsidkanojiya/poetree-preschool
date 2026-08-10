'use client';

import { useActionState } from 'react';
import { STUDENT_DOCUMENT_TYPES } from '@poetree/shared';
import { Field, FieldSet, FormError, FormSuccess, Input, Select, SubmitButton } from '@/components/ui/form';
import { attachDocumentAction, removeDocumentAction, type DocumentState } from './actions';

const TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Photograph',
  BIRTH_CERTIFICATE: 'Birth certificate',
  ADDRESS_PROOF: 'Address proof',
  MEDICAL: 'Medical',
  TRANSFER_CERTIFICATE: 'Transfer certificate',
  OTHER: 'Other',
};

export function AttachDocumentForm({ studentId }: { studentId: string }) {
  const [state, formAction] = useActionState<DocumentState, FormData>(attachDocumentAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="studentId" value={studentId} />

      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="What is it" required>
          <Select name="type" defaultValue="BIRTH_CERTIFICATE">
            {STUDENT_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type] ?? type}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Label" hint="Optional — helps when there are several of the same kind.">
          <Input name="label" maxLength={120} placeholder="e.g. Issued 2023" />
        </Field>
      </FieldSet>

      <Field
        label="File"
        required
        hint="Images and PDFs. The file is checked by its contents, not its name."
      >
        <input
          type="file"
          name="file"
          required
          accept="image/*,application/pdf"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-navy-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-navy-800"
        />
      </Field>

      <SubmitButton pendingLabel="Uploading…">Add document</SubmitButton>
    </form>
  );
}

export function RemoveDocumentButton({
  studentId,
  documentId,
}: {
  studentId: string;
  documentId: string;
}) {
  const [state, formAction] = useActionState<DocumentState, FormData>(removeDocumentAction, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        className="text-xs font-medium text-slate-400 transition-colors hover:text-rose-600"
      >
        Remove
      </button>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
