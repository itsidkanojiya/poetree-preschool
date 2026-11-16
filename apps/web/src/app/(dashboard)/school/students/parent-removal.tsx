import type { ParentSummary } from '@poetree/shared';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { removeParentAction } from '../removal-actions';

/**
 * What removing a parent does, said before it happens. It cannot be undone:
 * the parent is deleted for good, and a child for whom they are the only
 * parent here is removed for good with them.
 */
function RemovalBody({ parent }: { parent: ParentSummary }) {
  const onRoll = parent.children.filter((child) => !child.removed);
  const going = onRoll.filter((child) => !child.hasOtherGuardian);

  return (
    <>
      {parent.isTeacher ? (
        <p>
          They stay a teacher here, on the same account. Their parent role and their links to their
          children are deleted.
        </p>
      ) : (
        <p>
          They are deleted for good: their name, phone, email and password are erased and they
          cannot sign in. Fees and other school records stay, under “Deleted account”. Their phone
          and email can be used again.
        </p>
      )}

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
                  <span className="text-rose-700"> — removed for good, no other parent here</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {going.length > 0 && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-900 ring-1 ring-inset ring-rose-200">
          {going.map((child) => child.name).join(', ')} {going.length === 1 ? 'is' : 'are'} removed
          with them and cannot be restored. Their records are kept. To keep a child, link another
          parent to them first.
        </p>
      )}

      <p className="font-medium text-navy-950">This cannot be undone.</p>
    </>
  );
}

export function RemoveParentButton({
  parent,
  studentId,
  fromRemoved = false,
  className,
}: {
  parent: ParentSummary;
  /** The child's page it is on, to come back to while that child stays. */
  studentId?: string;
  /** On the Removed list: someone removed before removal was for good. */
  fromRemoved?: boolean;
  className?: string;
}) {
  const going = parent.children.filter((child) => !child.removed && !child.hasOtherGuardian);
  return (
    <ConfirmButton
      action={removeParentAction.bind(null, parent.userId, studentId, fromRemoved)}
      label={fromRemoved ? 'Delete permanently' : 'Remove parent'}
      title={fromRemoved ? `Delete ${parent.name} permanently?` : `Remove ${parent.name}?`}
      body={<RemovalBody parent={parent} />}
      confirmLabel={
        going.length > 0
          ? `Delete ${parent.name} and remove ${going.length === 1 ? going[0]!.name : `${going.length} children`}`
          : parent.isTeacher
            ? 'Remove parent role'
            : `Delete ${parent.name}`
      }
      className={className}
    />
  );
}
