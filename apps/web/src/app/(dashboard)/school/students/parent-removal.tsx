import type { ParentSummary } from '@poetree/shared';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { removeParentAction } from '../removal-actions';

/**
 * What removing a parent does, said before it happens — above all, which
 * children go with them. A child for whom they are the only parent here is
 * removed too, rather than left on the roll with nobody to reach; restoring the
 * parent brings the child back.
 */
function RemovalBody({ parent }: { parent: ParentSummary }) {
  const onRoll = parent.children.filter((child) => !child.removed);
  const going = onRoll.filter((child) => !child.hasOtherGuardian);

  return (
    <>
      <p>
        {parent.isTeacher
          ? 'They are signed out at once and can no longer sign in as a parent.'
          : 'They are signed out at once and cannot sign in.'}
      </p>

      {onRoll.length > 0 && (
        <div>
          <p>Their {onRoll.length === 1 ? 'child' : 'children'}:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {onRoll.map((child) => (
              <li key={child.id}>
                <span className="font-medium text-navy-950">{child.name}</span>
                {child.hasOtherGuardian ? (
                  <span> — stays, with their other parent</span>
                ) : (
                  <span className="text-rose-700"> — removed too, no other parent here</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {going.length > 0 && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-900 ring-1 ring-inset ring-rose-200">
          {going.map((child) => child.name).join(', ')} {going.length === 1 ? 'is' : 'are'} removed
          with them — off the roll, out of the app, every record kept. Restoring {parent.name}{' '}
          brings {going.length === 1 ? 'them' : 'them all'} back. To keep a child, link another
          parent to them first.
        </p>
      )}

      {parent.isTeacher && <p>They stay a teacher here — only the parent role is removed.</p>}
    </>
  );
}

export function RemoveParentButton({
  parent,
  studentId,
  className,
}: {
  parent: ParentSummary;
  /** The child's page it is on, to come back to while that child stays. */
  studentId?: string;
  className?: string;
}) {
  const going = parent.children.filter((child) => !child.removed && !child.hasOtherGuardian);
  return (
    <ConfirmButton
      action={removeParentAction.bind(null, parent.userId, studentId)}
      label="Remove parent"
      title={`Remove ${parent.name}?`}
      body={<RemovalBody parent={parent} />}
      confirmLabel={
        going.length > 0
          ? `Remove ${parent.name} and ${going.length === 1 ? going[0]!.name : `${going.length} children`}`
          : 'Remove parent'
      }
      className={className}
    />
  );
}
