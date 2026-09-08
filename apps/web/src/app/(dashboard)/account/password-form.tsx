'use client';

import { useActionState } from 'react';
import { Field, FormError, PasswordInput, SubmitButton } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { changePasswordAction, type PasswordState } from './actions';

export function PasswordForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className="max-w-md space-y-5">
      <FormError message={state.error} />

      <Notice tone="info">
        Changing your password signs you out everywhere, including here. You will need to sign in
        again with the new one.
      </Notice>

      <Field label="Current password" required>
        <PasswordInput name="currentPassword" autoComplete="current-password" required />
      </Field>

      <Field
        label="New password"
        required
        hint="At least 8 characters, with a letter and a number."
      >
        <PasswordInput name="newPassword" autoComplete="new-password" required minLength={8} />
      </Field>

      <Field label="Confirm new password" required>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} />
      </Field>

      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}
