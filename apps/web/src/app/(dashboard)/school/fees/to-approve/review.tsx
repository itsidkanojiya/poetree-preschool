'use client';

import { useActionState, useState } from 'react';
import { Button, FormError, Input, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/dialog';
import { PendingButton } from '@/components/ui/kept-form';
import { approveProofAction, rejectProofAction, type ReviewState } from './actions';

/**
 * Approve — for the amount on the screenshot, which is what was owed unless
 * the office changes it — or reject, with a reason the family will read.
 */
export function ReviewProof({
  proofId,
  who,
  amountInPaise,
}: {
  proofId: string;
  /** The child's name, for the message once it is done. */
  who: string;
  amountInPaise: number;
}) {
  const [approveState, approve, approving] = useActionState<ReviewState, FormData>(
    approveProofAction.bind(null, proofId, who),
    {},
  );
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectState, reject, rejecting] = useActionState<ReviewState, FormData>(
    async (prev, formData) => {
      const next = await rejectProofAction(proofId, who, prev, formData);
      if (next.done) setRejectOpen(false);
      return next;
    },
    {},
  );

  return (
    <div className="space-y-2">
      <FormError message={approveState.error} />
      <form action={approve} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Amount received (₹)</span>
          <Input
            name="amount"
            type="number"
            min={1}
            step="1"
            inputMode="numeric"
            defaultValue={amountInPaise / 100}
            className="w-36"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRejectOpen(true)}
          disabled={approving}
        >
          Reject…
        </Button>
        <PendingButton pending={approving} pendingLabel="Approving…">
          Approve
        </PendingButton>
      </form>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject this payment?"
        description="The family sees your reason in the app and can send the screenshot again."
      >
        <form action={reject} className="space-y-4">
          <FormError message={rejectState.error} />
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-navy-950">Reason</span>
            <Textarea
              name="reason"
              rows={3}
              maxLength={200}
              placeholder="e.g. The screenshot is blurry, or the amount does not match"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              Keep it
            </Button>
            <PendingButton pending={rejecting} pendingLabel="Rejecting…" variant="danger">
              Reject
            </PendingButton>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
