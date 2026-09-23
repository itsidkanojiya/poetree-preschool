'use client';

import { useActionState } from 'react';
import type { BranchSummary } from '@poetree/shared';
import { FormError, SubmitButton } from '@/components/ui/form';
import { switchBranchAction, type SwitchState } from './actions';

/**
 * The branches of one group, as a list to pick from.
 *
 * One form per branch rather than a select and a button: the branch is the
 * whole decision, and a person picking where to work should not have to make
 * it twice.
 */
export function BranchList({ branches }: { branches: BranchSummary[] }) {
  const [state, formAction] = useActionState<SwitchState, FormData>(switchBranchAction, {});

  if (branches.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        This group has no branches yet. Poetree Publication adds them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message={state.error} />

      {branches.map((branch) => (
        <form
          key={branch.id}
          action={formAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-navy-950/10"
        >
          <input type="hidden" name="schoolId" value={branch.id} />

          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-950">
              {branch.name}
              {branch.isCurrent && (
                <span className="ml-2 rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-medium text-white">
                  current
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              <code className="font-mono">{branch.code}</code>
              {branch.city && <> · {branch.city}</>} · {branch.counts.students} children ·{' '}
              {branch.counts.teachers} teachers
              {branch.status !== 'ACTIVE' && branch.status !== 'TRIAL' && (
                <> · {branch.status.toLowerCase()}</>
              )}
            </p>
          </div>

          <SubmitButton
            variant={branch.isCurrent ? 'secondary' : 'primary'}
            pendingLabel="Opening…"
          >
            {branch.isCurrent ? 'Reopen' : 'Open'}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
