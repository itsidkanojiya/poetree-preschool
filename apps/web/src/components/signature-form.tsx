'use client';

import { useActionState, useState } from 'react';
import { FormError, Input, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';

interface State {
  error?: string;
  success?: string;
}

/**
 * A signature, as a picture: what it looks like now, and a file box to
 * replace it. Submitting with nothing chosen takes it off.
 *
 * PNG and JPEG only — report cards and certificates are PDFs, and the PDF
 * library cannot draw a WebP, so a WebP signature would print as nothing.
 */
export function SignatureForm({
  action,
  signatureUrl,
  name,
}: {
  /** A server action taking the form, with a file under "signature". */
  action: (prev: State, formData: FormData) => Promise<State>;
  signatureUrl: string | null;
  /** Whose signature, for the label. */
  name: string;
}) {
  const [state, formAction] = useActionState<State, FormData>(action, {});
  const fileId = signatureUrl?.split('/').pop();

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="grid h-20 place-items-center rounded-xl bg-white ring-1 ring-navy-950/10">
        {fileId ? (
          /* A plain img: one small picture from our own API. */
          <img
            src={`/attachments?id=${fileId}`}
            alt={`${name}’s signature`}
            className="max-h-16 max-w-[90%] object-contain"
          />
        ) : (
          <span className="text-xs text-slate-400">
            No signature yet — a blank line is printed instead
          </span>
        )}
      </div>
      <Input
        name="signature"
        type="file"
        accept="image/png,image/jpeg"
        aria-label={`${name}’s signature`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Uploading…">
          {fileId ? 'Replace' : 'Upload'}
        </SubmitButton>
        <p className="text-xs text-slate-500">
          Sign on white paper and photograph it close up; a PNG with a clear background prints best.
          {fileId && ' Submit with nothing chosen to take it off.'}
        </p>
      </div>
    </form>
  );
}

/** The same, closed until asked for: for a row in a list of people. */
export function SignatureButton(props: Parameters<typeof SignatureForm>[0]) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        {props.signatureUrl ? 'Signature ✓' : 'Add signature'}
      </button>
    );
  }

  return (
    <div className="w-72 space-y-2">
      <SignatureForm {...props} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-medium text-slate-500 hover:text-navy-900"
      >
        Close
      </button>
    </div>
  );
}
