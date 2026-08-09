'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-5">
      {notice && !state.error && (
        <Notice tone="warning">
          <span>{notice}</span>
        </Notice>
      )}

      <FormError message={state.error} />

      <Field label="Email or phone" required>
        <Input
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="you@school.com"
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
