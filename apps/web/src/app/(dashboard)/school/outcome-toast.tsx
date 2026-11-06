import { Toast } from '@/components/ui/toast';

export interface Outcome {
  done?: string;
  who?: string;
  problem?: string;
}

/**
 * What a remove or restore did, from the address it came back to.
 *
 * Only the two outcomes it knows are worded; the name is the one part taken
 * from the address, and it is only ever shown as text.
 */
export function OutcomeToast({
  outcome,
  removed,
  restored,
  activated = (who) => `${who} is active again and can sign in.`,
  deactivated = (who) => `${who} is deactivated and can no longer sign in.`,
  messages = {},
}: {
  outcome: Outcome;
  removed: (who: string) => string;
  restored: (who: string) => string;
  activated?: (who: string) => string;
  deactivated?: (who: string) => string;
  /** Other outcomes a page knows, by their `done`. */
  messages?: Record<string, (who: string) => string>;
}) {
  if (outcome.problem) return <Toast tone="bad" message={outcome.problem.slice(0, 300)} />;

  const who = outcome.who?.slice(0, 120);
  if (!who) return null;
  if (outcome.done === 'removed') return <Toast message={removed(who)} />;
  if (outcome.done === 'restored') return <Toast message={restored(who)} />;
  if (outcome.done === 'activated') return <Toast message={activated(who)} />;
  if (outcome.done === 'deactivated') return <Toast message={deactivated(who)} />;
  // A parent removed with the children who went with them: "parent|children".
  if (outcome.done === 'removed-with') {
    const [parent, children] = who.split('|');
    return (
      <Toast
        message={`${parent} is removed, and ${children} with them — nobody else here was their parent. Restore ${parent} to bring them back.`}
      />
    );
  }
  const message = outcome.done ? messages[outcome.done] : undefined;
  if (message) return <Toast message={message(who)} />;
  return null;
}
