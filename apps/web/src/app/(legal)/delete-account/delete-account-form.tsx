'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, PasswordInput, Select, SubmitButton } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { deleteAccountAction, type DeleteAccountState } from './actions';

export function DeleteAccountForm() {
  const [state, formAction] = useActionState<DeleteAccountState, FormData>(deleteAccountAction, {});

  if (state.deleted) {
    const at = state.deleted.schoolName ? ` at ${state.deleted.schoolName}` : '';
    return (
      <Notice
        tone="success"
        title={
          state.deleted.registrationOnly
            ? 'Your registration has been withdrawn'
            : 'Your account has been deleted'
        }
      >
        {state.deleted.registrationOnly ? (
          <p>
            The school had not approved it yet, so there was no account. The details you sent
            {at} have been erased.
          </p>
        ) : (
          <p>
            Your Poetree Kids account{at} and your personal details have been erased. You can
            uninstall the app. Your child&rsquo;s school record stays with the school.
          </p>
        )}
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <Field label="Phone number or email" required hint="The one you sign in to the app with.">
        <Input
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="+91 98200 00000"
          defaultValue={state.identifier}
          required
        />
      </Field>

      <Field label="Password" required>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>

      {/* Only when the API has said this login belongs to more than one
          school — nobody is asked for a School ID they do not need. */}
      {state.schoolCodes && state.schoolCodes.length > 0 && (
        <Field
          label="School ID"
          required
          hint="This login has an account at more than one school. Choose the one to delete."
        >
          <Select name="schoolCode" defaultValue={state.schoolCodes[0]} required>
            {state.schoolCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="confirm"
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
        />
        <span>
          I understand that my account will be deleted permanently and cannot be restored.
        </span>
      </label>

      <SubmitButton variant="danger" className="w-full" pendingLabel="Deleting…">
        Delete my account
      </SubmitButton>
    </form>
  );
}
