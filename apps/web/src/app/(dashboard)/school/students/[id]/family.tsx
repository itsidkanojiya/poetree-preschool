import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ParentSummary, StudentSummary } from '@poetree/shared';
import { Avatar, Card, Notice, Pill } from '@/components/ui/layout';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { ChangePasswordButton } from '../../change-password';
import { StatusToggle } from '../../status-toggle';
import { RemoveParentButton } from '../parent-removal';
import { makePrimaryAction, unlinkGuardianAction } from '../family-actions';
import { EditParentDialog, LinkParentDialog } from './family-dialogs';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-navy-950">{children || '—'}</dd>
    </div>
  );
}

const SMALL =
  'rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors disabled:cursor-not-allowed';

/**
 * The child's family, managed where the child is.
 *
 * Each parent with everything the office reaches them by, and everything the
 * office does to them: correct their details, choose the main contact, switch
 * their sign-in off or set a password, unlink them from this child, or remove
 * them from the school — which, for a child with no other parent, takes the
 * child too, and says so first.
 */
export function FamilyCard({
  student,
  parents,
}: {
  student: StudentSummary;
  /** Each linked parent's account, in the order of `student.guardians`. */
  parents: ParentSummary[];
}) {
  const only = student.guardians.length === 1;

  return (
    <Card
      title="Family"
      description="Who signs in for this child, who the school contacts, and how to reach them."
      action={
        student.guardians.length < 4 ? (
          <LinkParentDialog
            studentId={student.id}
            studentName={student.fullName}
            exclude={student.guardians.map((guardian) => guardian.parentProfileId)}
            hasPrimary={student.guardians.some((guardian) => guardian.isPrimary)}
          />
        ) : undefined
      }
    >
      {student.guardians.length === 0 ? (
        <Notice tone="danger" title="No parent linked">
          Nobody can sign in for {student.fullName} or be reached about them. Link a parent.
        </Notice>
      ) : (
        <ul className="space-y-4">
          {student.guardians.map((guardian, index) => {
            const parent = parents[index]!;
            const siblings = parent.children.filter(
              (child) => child.id !== student.id && !child.removed,
            );
            return (
              <li
                key={guardian.parentProfileId}
                className="rounded-xl p-4 ring-1 ring-navy-950/[0.08]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={parent.name} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-navy-950">
                        {parent.name}
                        {guardian.isPrimary && <Pill tone="gold">Main contact</Pill>}
                        {parent.isTeacher && <Pill>Also a teacher</Pill>}
                      </p>
                      <p className="text-xs text-slate-500">{titleCase(guardian.relation)}</p>
                    </div>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <EditParentDialog
                      studentId={student.id}
                      parent={parent}
                      parentProfileId={guardian.parentProfileId}
                      relation={guardian.relation}
                    />
                    {!guardian.isPrimary && (
                      <form
                        action={makePrimaryAction.bind(
                          null,
                          student.id,
                          guardian.parentProfileId,
                          parent.name,
                        )}
                      >
                        <button
                          type="submit"
                          className={`${SMALL} text-navy-800 ring-navy-200 hover:bg-navy-50`}
                        >
                          Make main contact
                        </button>
                      </form>
                    )}
                  </span>
                </div>

                <dl className="mt-4 space-y-1.5">
                  <Line label="Mobile">
                    {parent.phone && (
                      <a href={`tel:${parent.phone}`} className="hover:text-navy-700">
                        {parent.phone}
                      </a>
                    )}
                  </Line>
                  <Line label="Email">
                    {parent.email && (
                      <a href={`mailto:${parent.email}`} className="hover:text-navy-700">
                        {parent.email}
                      </a>
                    )}
                  </Line>
                  <Line label="Address">{parent.address}</Line>
                  <Line label="Occupation">{parent.occupation}</Line>
                  {siblings.length > 0 && (
                    <Line label="Also parent of">
                      <span className="flex flex-wrap gap-1">
                        {siblings.map((child) => (
                          <Link key={child.id} href={`/school/students/${child.id}`}>
                            <Pill>{child.name}</Pill>
                          </Link>
                        ))}
                      </span>
                    </Line>
                  )}
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-navy-950/[0.06] pt-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Sign-in</span>
                    <StatusToggle
                      kind="parents"
                      userId={parent.userId}
                      name={parent.name}
                      status={parent.status}
                      alsoOtherRole={parent.isTeacher}
                      studentId={student.id}
                    />
                    <ChangePasswordButton
                      kind="parents"
                      userId={parent.userId}
                      name={parent.name}
                    />
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {!only && (
                      <ConfirmButton
                        action={unlinkGuardianAction.bind(
                          null,
                          student.id,
                          guardian.parentProfileId,
                          parent.name,
                        )}
                        label="Unlink"
                        title={`Unlink ${parent.name} from ${student.fullName}?`}
                        body={`They stop seeing ${student.fullName} in the app. Their account${
                          siblings.length > 0 ? ' and their other children' : ''
                        } stay as they are, and you can link them again.`}
                        confirmLabel="Unlink"
                        className={`${SMALL} text-slate-600 ring-navy-200 hover:bg-navy-50`}
                      />
                    )}
                    <RemoveParentButton
                      parent={parent}
                      studentId={student.id}
                      className={`${SMALL} text-rose-700 ring-rose-200 hover:bg-rose-50`}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {only && (
        <p className="mt-4 text-xs text-slate-500">
          The only parent here: removing them removes {student.fullName} too. Link a second parent
          to keep {student.fullName} on the roll whatever happens to one account.
        </p>
      )}
    </Card>
  );
}
