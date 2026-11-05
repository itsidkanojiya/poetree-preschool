import { ConfirmButton } from '@/components/ui/confirm-button';
import { Pill } from '@/components/ui/layout';
import { setAccountStatusAction } from './removal-actions';

/**
 * A teacher's or parent's account: whether it is on, and the switch.
 *
 * Switching off is asked first, because it signs the person out at once;
 * switching back on is not — giving somebody their access back takes nothing
 * from anyone. Nothing about the account changes but whether it can be used.
 */
export function StatusToggle({
  kind,
  userId,
  name,
  status,
  alsoOtherRole,
}: {
  kind: 'teachers' | 'parents';
  userId: string;
  name: string;
  status: string;
  /** A teacher who is also a parent here, or a parent who also teaches. */
  alsoOtherRole: boolean;
}) {
  const active = status === 'ACTIVE';
  const label = active ? 'Active' : status === 'SUSPENDED' ? 'Suspended' : 'Inactive';
  const other = kind === 'teachers' ? 'a parent' : 'a teacher';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={active ? 'brand' : 'neutral'}>{label}</Pill>
      {active ? (
        <ConfirmButton
          action={setAccountStatusAction.bind(null, kind, userId, 'INACTIVE')}
          label="Deactivate"
          title={`Deactivate ${name}?`}
          body={
            <>
              <p>
                They are signed out at once, and cannot sign in or use the app until you activate
                them again.
              </p>
              <p>Nothing is removed — their details and records stay exactly as they are.</p>
              {alsoOtherRole && (
                <p className="font-medium text-amber-800">
                  This switches off their whole account, so they cannot sign in as {other} either.
                  To take away only this role, use Remove instead.
                </p>
              )}
            </>
          }
          confirmLabel="Deactivate"
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 transition-colors hover:bg-amber-50"
        />
      ) : (
        <form action={setAccountStatusAction.bind(null, kind, userId, 'ACTIVE')}>
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-leaf-800 ring-1 ring-leaf-200 transition-colors hover:bg-leaf-50"
          >
            Activate
          </button>
        </form>
      )}
    </div>
  );
}
