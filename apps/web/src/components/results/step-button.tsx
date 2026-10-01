'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import type { StepState } from '@/lib/results-actions';

/**
 * One step in a report card's journey: hand over, hand back, publish.
 *
 * Asks once, in place, when the step reaches families or cannot be undone
 * quietly — "Publish" becomes "Yes, tell 24 families" — rather than opening a
 * dialog; then says what happened in a toast.
 */
export function StepButton({
  action,
  label,
  confirm,
  variant = 'primary',
  disabled,
}: {
  /** A server action, already bound to the class and term. */
  action: () => Promise<StepState>;
  label: string;
  /** The second label, when the step should be asked twice. */
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger';
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StepState | null>(null);

  function run() {
    if (confirm && !asking) {
      setAsking(true);
      return;
    }
    setAsking(false);
    startTransition(async () => setResult(await action()));
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Button type="button" variant={variant} onClick={run} disabled={disabled || pending}>
        {pending ? 'Working…' : asking ? confirm : label}
      </Button>
      {asking && (
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      )}
      <Toast message={result?.error ?? result?.success} tone={result?.error ? 'bad' : 'good'} />
    </span>
  );
}
