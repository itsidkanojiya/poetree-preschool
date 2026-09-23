'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, PasswordInput, Select, SubmitButton } from '@/components/ui/form';
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
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>

      {/* Only ever shown when the API has said it cannot tell which school this
          login belongs to. Nobody is asked for a code they do not need. */}
      {state.schoolCodes && state.schoolCodes.length > 0 && (
        <Field label="School" required hint="This login exists at more than one school.">
          <Select name="schoolCode" defaultValue={state.schoolCodes[0]} required>
            {state.schoolCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
