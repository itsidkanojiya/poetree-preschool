import type { ClassroomSummary, Paginated, TeacherSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import Link from 'next/link';
import { IconPlus } from '@/components/icons';
import { ChangePasswordButton } from '../change-password';
import { SignatureButton } from '@/components/signature-form';
import { uploadTeacherSignatureAction } from '../actions';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { TabStrip } from '@/components/ui/tab-strip';
import { removeTeacherAction, restoreTeacherAction } from '../removal-actions';
import { RestoreButton } from '../restore-button';
import { OutcomeToast } from '../outcome-toast';
import { StatusToggle } from '../status-toggle';
import { ExcelExportButton } from '@/components/excel-export';

/** The consequences, said before they happen. */
function removalBody(teacher: TeacherSummary): string {
  return teacher.isParent
    ? 'They are signed out at once and can no longer sign in as a teacher. They leave their classes and the timetable; their name stays on past attendance and homework. They stay a parent here — only the teacher role is removed. You can restore them.'
    : 'They are signed out at once and cannot sign in. They leave their classes and the timetable; their name stays on past attendance and homework. You can restore them.';
}

export default async function TeachersPage({
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
  const basePath = showRemoved ? '/school/teachers?removed=true' : '/school/teachers';

  const [teachers, classrooms] = await Promise.all([
    apiFetch<Paginated<TeacherSummary>>('/teachers', {
      query: { page, pageSize: 20, search, removed: showRemoved ? 'true' : undefined },
    }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teaching staff at your school."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton
              endpoint="/school/exports"
              type="teachers"
              title="Export teachers to Excel"
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
                  name: 'classroomId',
                  label: 'Teaching the class',
                  allLabel: 'Any class',
                  options: classrooms.map((c) => ({
                    value: c.id,
                    label: `${c.classLevel.name} — ${c.section} (${c.academicYear.name})`,
                  })),
                },
              ]}
            />
            <Link href="/school/teachers/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
              <IconPlus size={17} />
              Add teacher
            </Link>
          </div>
        }
      />

      <TabStrip
        current={showRemoved ? 'removed' : 'current'}
        tabs={[
          { key: 'current', label: 'Current', href: '/school/teachers' },
          { key: 'removed', label: 'Removed', href: '/school/teachers?removed=true' },
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

      <Card>
        {teachers.items.length === 0 ? (
          showRemoved ? (
            <EmptyState
              title="Nobody removed"
              description="Teachers you remove appear here, and can be restored."
            />
          ) : (
            <EmptyState title="No teachers yet" description="Add your first teacher to get started." />
          )
        ) : (
          <>
            <Table>
              {showRemoved ? (
                <THead
                  columns={[
                    'Teacher',
                    'Phone',
                    'Employee code',
                    'Removed',
                    { label: 'Actions', hidden: true },
                  ]}
                />
              ) : (
                <THead
                  columns={[
                    'Teacher',
                    'Phone',
                    'Employee code',
                    { label: 'Classes', numeric: true },
                    'Joined',
                    'State',
                    'Sign-in',
                    // Printed on the report cards of their classes.
                    'Signature',
                    { label: 'Actions', hidden: true },
                  ]}
                />
              )}
              <tbody>
                {teachers.items.map((teacher) => (
                  <TRow key={teacher.userId}>
                    <TCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={teacher.name} />
                        <TPrimary sub={teacher.email ?? undefined}>{teacher.name}</TPrimary>
                        {teacher.isParent && <Pill>Also a parent</Pill>}
                      </div>
                    </TCell>
                    <TCell>{teacher.phone ?? '—'}</TCell>
                    <TCell>{teacher.employeeCode ?? '—'}</TCell>
                    {showRemoved ? (
                      <>
                        <TCell>{formatDate(teacher.removedAt)}</TCell>
                        <TCell numeric>
                          <RestoreButton
                            action={restoreTeacherAction.bind(null, teacher.userId)}
                            name={teacher.name}
                          />
                        </TCell>
                      </>
                    ) : (
                      <>
                        <TCell numeric>{teacher.classroomCount}</TCell>
                        <TCell>{formatDate(teacher.joinedAt)}</TCell>
                        <TCell>
                          <StatusToggle
                            kind="teachers"
                            userId={teacher.userId}
                            name={teacher.name}
                            status={teacher.status}
                            alsoOtherRole={teacher.isParent}
                          />
                        </TCell>
                        <TCell>
                          <ChangePasswordButton
                            kind="teachers"
                            userId={teacher.userId}
                            name={teacher.name}
                          />
                        </TCell>
                        <TCell>
                          <SignatureButton
                            action={uploadTeacherSignatureAction.bind(null, teacher.userId)}
                            signatureUrl={teacher.signatureUrl}
                            name={teacher.name}
                          />
                        </TCell>
                        <TCell numeric>
                          <ConfirmButton
                            action={removeTeacherAction.bind(null, teacher.userId)}
                            label="Remove"
                            title={`Remove ${teacher.name}?`}
                            body={removalBody(teacher)}
                            confirmLabel="Remove teacher"
                          />
                        </TCell>
                      </>
                    )}
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={teachers.page}
              totalPages={teachers.totalPages}
              total={teachers.total}
              basePath={basePath}
            />
          </>
        )}
      </Card>

      <OutcomeToast
        outcome={{ done, who, problem }}
        removed={(name) => `${name} is removed. They are under Removed if they come back.`}
        restored={(name) => `${name} is restored. Put them back on their classes from Classrooms.`}
      />
    </>
  );
}
