'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {notice && !state.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      )}

      <FormError message={state.error} />

      <Field label="Email or phone" required>
        <Input
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="admin@poetree.com"
          required
          autoFocus
        />
      </Field>

      <Field label="Password" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
