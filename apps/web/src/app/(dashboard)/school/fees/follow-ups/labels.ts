import type { FeeFollowUpOutcome, FeeFollowUpState } from '@poetree/shared';

/**
 * Words for the office. Kept out of forms.tsx so the server-rendered table
 * can use them too: a value exported from a client module reaches a server
 * component as a reference, not as the object.
 */
export const OUTCOME_LABELS: Record<FeeFollowUpOutcome, string> = {
  REACHED: 'Reached',
  NO_ANSWER: 'No answer',
  PROMISED_PAYMENT: 'Promised to pay',
  REQUESTED_TIME: 'Asked for more time',
  WRONG_NUMBER: 'Wrong number',
  OTHER: 'Other',
};

export const STATE_LABELS: Record<
  FeeFollowUpState,
  { label: string; tone: 'neutral' | 'brand' | 'gold' }
> = {
  PENDING: { label: 'Pending', tone: 'brand' },
  OVERDUE: { label: 'Overdue', tone: 'gold' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
