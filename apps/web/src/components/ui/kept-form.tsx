'use client';

import { startTransition, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/form';

/**
 * A form that keeps what was typed when the server says no.
 *
 * React resets a form passed to `<form action>` as soon as the action returns
 * — success or not — so a refused save used to wipe every box and the office
 * typed the family in again. This submits the same FormData through the same
 * action, without the reset. The button that submitted it is included, so a
 * button with a name and value says which way forward was chosen.
 */
export function KeptForm({
  action,
  className,
  children,
}: {
  action: (data: FormData) => void;
  className?: string;
  children: ReactNode;
}) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter ?? undefined);
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}

/** The submit button for a KeptForm, which has no form status of its own to read. */
export function PendingButton({
  pending,
  children,
  pendingLabel = 'Working…',
  variant = 'primary',
  className = '',
  name,
  value,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  name?: string;
  value?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className={className}
      name={name}
      value={value}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
