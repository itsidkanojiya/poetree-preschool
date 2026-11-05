import type { ClassroomSummary, Paginated, ParentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import Link from 'next/link';
import { IconPlus } from '@/components/icons';
import { ChangePasswordButton } from '../change-password';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { TabStrip } from '@/components/ui/tab-strip';
import { formatDate } from '@/lib/format';
import { removeParentAction, restoreParentAction } from '../removal-actions';
import { RestoreButton } from '../restore-button';
import { OutcomeToast } from '../outcome-toast';
import { StatusToggle } from '../status-toggle';
import { ExcelExportButton } from '@/components/excel-export';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * The consequences, said before they happen — and above all which children
 * would be left with nobody who can sign in for them.
 */
function RemovalBody({ parent }: { parent: ParentSummary }) {
  const alone = parent.children.filter((child) => !child.hasOtherGuardian);

  return (
    <>
      <p>
        {parent.isTeacher
          ? 'They are signed out at once and can no longer sign in as a parent.'
          : 'They are signed out at once and cannot sign in.'}
      </p>

      {parent.children.length > 0 && (
        <div>
          <p>Their {parent.children.length === 1 ? 'child' : 'children'}:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {parent.children.map((child) => (
              <li key={child.id}>
                <span className="font-medium text-navy-950">{child.name}</span>
                {!child.hasOtherGuardian && (
                  <span className="text-rose-700"> — no other parent</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alone.length > 0 && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-900 ring-1 ring-inset ring-rose-200">
          {alone.map((child) => child.name).join(', ')} will have no parent who can sign in, until
          you link another parent or restore this one.
        </p>
      )}

      <p>Their children’s records are not touched. You can restore them.</p>

      {parent.isTeacher && <p>They stay a teacher here — only the parent role is removed.</p>}
    </>
  );
}

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    removed?: string;
    done?: string;
    who?: string;
    problem?: string;
  }>;
}) {
  const { page = '1', search, removed, done, who, problem } = await searchParams;
  const showRemoved = removed === 'true';
  const basePath = showRemoved ? '/school/parents?removed=true' : '/school/parents';

  const [parents, classrooms, standards] = await Promise.all([
    apiFetch<Paginated<ParentSummary>>('/parents', {
      query: { page, pageSize: 20, search, removed: showRemoved ? 'true' : undefined },
    }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
  ]);

  return (
    <>
      <PageHeader
        title="Parents"
        description="Parents own the family login. Children are profiles under their account."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton
              endpoint="/school/exports"
              type="parents"
              title="Export parents to Excel"
              filters={[
                {
                  name: 'status',
                  label: 'Status',
                  allLabel: 'Any status',
                  options: [
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'INACTIVE', label: 'Inactive' },
                    { value: 'SUSPENDED', label: 'Suspended' },
                  ],
                },
                {
                  name: 'classLevelId',
                  label: 'With a child in the standard',
                  allLabel: 'Any standard',
                  options: standards.map((s) => ({ value: s.id, label: s.name })),
                },
                {
                  name: 'classroomId',
                  label: 'With a child in the class',
                  allLabel: 'Any class',
                  options: classrooms.map((c) => ({
                    value: c.id,
                    label: `${c.classLevel.name} — ${c.section} (${c.academicYear.name})`,
                  })),
                },
              ]}
            />
            <Link href="/school/parents/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
              <IconPlus size={17} />
              Add parent
            </Link>
          </div>
        }
      />

      <TabStrip
        current={showRemoved ? 'removed' : 'current'}
        tabs={[
          { key: 'current', label: 'Current', href: '/school/parents' },
          { key: 'removed', label: 'Removed', href: '/school/parents?removed=true' },
        ]}
      />

      {search && (
        <p className="mb-4 text-sm text-slate-500">
          Showing matches for “{search}”.{' '}
          <Link href={basePath} className="font-medium text-navy-700 underline">
            Show all
          </Link>
        </p>
      )}

      <Card className="mb-6">
        {parents.items.length === 0 ? (
          showRemoved ? (
            <EmptyState
              title="Nobody removed"
              description="Parents you remove appear here, and can be restored with their children as they were."
            />
          ) : (
            <EmptyState
              title="No parents yet"
              description="Add a parent before adding students — every child is linked to a guardian."
            />
          )
        ) : (
          <>
            <Table>
              <THead
                columns={
                  showRemoved
                    ? ['Parent', 'Phone', 'Children', 'Removed', { label: 'Actions', hidden: true }]
                    : [
                        'Parent',
                        'Phone',
                        'Relation',
                        'Children',
                        'State',
                        'Sign-in',
                        { label: 'Actions', hidden: true },
                      ]
                }
              />
              <tbody>
                {parents.items.map((parent) => (
                  <TRow key={parent.userId}>
                    <TCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={parent.name} />
                        <TPrimary sub={parent.email ?? undefined}>{parent.name}</TPrimary>
                        {parent.isTeacher && <Pill>Also a teacher</Pill>}
                      </div>
                    </TCell>
                    <TCell>{parent.phone ?? '—'}</TCell>
                    {!showRemoved && <TCell>{titleCase(parent.relation)}</TCell>}
                    <TCell>
                      {parent.children.length === 0 ? (
                        <span className="text-slate-400">None linked</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {parent.children.map((child) => (
                            <Pill key={child.id} tone={child.isPrimary ? 'gold' : 'neutral'}>
                              {child.name}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </TCell>
                    {showRemoved ? (
                      <>
                        <TCell>{formatDate(parent.removedAt)}</TCell>
                        <TCell numeric>
                          <RestoreButton
                            action={restoreParentAction.bind(null, parent.userId)}
                            name={parent.name}
                          />
                        </TCell>
                      </>
                    ) : (
                      <>
                        <TCell>
                          <StatusToggle
                            kind="parents"
                            userId={parent.userId}
                            name={parent.name}
                            status={parent.status}
                            alsoOtherRole={parent.isTeacher}
                          />
                        </TCell>
                        <TCell>
                          <ChangePasswordButton
                            kind="parents"
                            userId={parent.userId}
                            name={parent.name}
                          />
                        </TCell>
                        <TCell numeric>
                          <ConfirmButton
                            action={removeParentAction.bind(null, parent.userId)}
                            label="Remove"
                            title={`Remove ${parent.name}?`}
                            body={<RemovalBody parent={parent} />}
                            confirmLabel="Remove parent"
                          />
                        </TCell>
                      </>
                    )}
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={parents.page}
              totalPages={parents.totalPages}
              total={parents.total}
              basePath={basePath}
            />
          </>
        )}
      </Card>

      <OutcomeToast
        outcome={{ done, who, problem }}
        removed={(name) => `${name} is removed. Their children’s records are as they were.`}
        restored={(name) => `${name} is restored, with their children as before.`}
      />
    </>
  );
}
