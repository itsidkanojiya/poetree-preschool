import Link from 'next/link';
import type {
  AcademicYearSummary,
  ClassroomSummary,
  Paginated,
  ParentSummary,
  StudentSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconPlus, IconSearch } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { restoreParentAction, restoreStudentAction } from '../removal-actions';
import { RestoreButton } from '../restore-button';
import { OutcomeToast } from '../outcome-toast';
import { ExcelExportButton } from '@/components/excel-export';
import { StudentsSectionTabs } from './section-tabs';

/** The parent the school contacts first, and how many others there are. */
function FamilyCell({ student }: { student: StudentSummary }) {
  const primary =
    student.guardians.find((guardian) => guardian.isPrimary) ?? student.guardians[0] ?? null;
  if (!primary) return <span className="text-rose-700">No parent linked</span>;
  const others = student.guardians.length - 1;
  return (
    <span className="block">
      <span className="block text-sm text-navy-950">{primary.name}</span>
      <span className="block text-xs text-slate-500">
        {primary.phone ?? 'No mobile'}
        {others > 0 && ` · +${others} more`}
      </span>
    </span>
  );
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    classroomId?: string;
    removed?: string;
    done?: string;
    who?: string;
    problem?: string;
  }>;
}) {
  const { page = '1', search, classroomId, removed, done, who, problem } = await searchParams;
  // A removed child has left their class, so the classroom filter means
  // nothing on that list.
  const showRemoved = removed === 'true';
  const listPath = showRemoved ? '/school/students?removed=true' : '/school/students';

  const [students, classrooms, years, standards, removedParents] = await Promise.all([
    apiFetch<Paginated<StudentSummary>>('/students', {
      query: showRemoved
        ? { page, pageSize: 20, search, removed: 'true' }
        : { page, pageSize: 20, search, classroomId },
    }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
    // Removed parents sit beside removed children: restoring a parent is how a
    // child removed with them comes back.
    showRemoved
      ? apiFetch<Paginated<ParentSummary>>('/parents', {
          query: { pageSize: 50, search, removed: 'true' },
        })
      : Promise.resolve(null),
  ]);

  const filtered = Boolean(search || (!showRemoved && classroomId));

  return (
    <>
      <PageHeader
        title="Students"
        description="Children and their families, in one place. Open a child to see and change everything about them and their parents."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton
              endpoint="/school/exports"
              type="students"
              title="Export students to Excel"
              filters={[
                {
                  name: 'academicYearId',
                  label: 'Academic year',
                  allLabel: 'Any year',
                  initial: years.find((y) => y.isCurrent)?.id,
                  options: years.map((y) => ({ value: y.id, label: y.name })),
                },
                {
                  name: 'classLevelId',
                  label: 'Standard',
                  allLabel: 'All standards',
                  options: standards.map((s) => ({ value: s.id, label: s.name })),
                },
                {
                  name: 'classroomId',
                  label: 'Class (standard and section)',
                  allLabel: 'All classes',
                  options: classrooms.map((c) => ({
                    value: c.id,
                    label: `${c.classLevel.name} — ${c.section} (${c.academicYear.name})`,
                  })),
                },
                {
                  name: 'status',
                  label: 'Status',
                  allLabel: 'Any status',
                  options: [
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'INACTIVE', label: 'Inactive' },
                    { value: 'GRADUATED', label: 'Graduated' },
                    { value: 'WITHDRAWN', label: 'Withdrawn' },
                  ],
                },
              ]}
            />
            <Link
              href="/school/students/new"
              className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
            >
              <IconPlus size={17} />
              Add student
            </Link>
          </div>
        }
      />

      <StudentsSectionTabs current={showRemoved ? 'removed' : 'children'} />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/students">
          {showRemoved && <input type="hidden" name="removed" value="true" />}
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor="student-search"
              className="mb-1.5 block text-sm font-medium text-navy-950"
            >
              Search
            </label>
            <div className="relative">
              <IconSearch
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="student-search"
                name="search"
                defaultValue={search}
                placeholder="Child’s name, admission number, or a parent’s name or mobile"
                className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600"
              />
            </div>
          </div>

          {!showRemoved && (
            <div className="w-56">
              <label
                htmlFor="student-class"
                className="mb-1.5 block text-sm font-medium text-navy-950"
              >
                Classroom
              </label>
              <select
                id="student-class"
                name="classroomId"
                defaultValue={classroomId ?? ''}
                className="w-full rounded-xl border-0 bg-white py-2.5 pl-3.5 pr-9 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600"
              >
                <option value="">All classrooms</option>
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.classLevel.name} — {classroom.section}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
          >
            Apply
          </button>

          {filtered && (
            <Link
              href={listPath}
              className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      {showRemoved ? (
        <>
          <Card
            className="mb-6"
            title="Children"
            description="Off the roll, every record kept. A child removed with their only parent comes back when that parent is restored."
          >
            {students.items.length === 0 ? (
              <EmptyState
                title={filtered ? 'No removed children match that search' : 'No children removed'}
                description="Children you remove appear here and can be restored."
              />
            ) : (
              <>
                <Table>
                  <THead
                    columns={['Student', 'Removed', 'Why', { label: 'Actions', hidden: true }]}
                  />
                  <tbody>
                    {students.items.map((student) => (
                      <TRow key={student.id}>
                        <TCell>
                          <Link
                            href={`/school/students/${student.id}`}
                            className="flex items-center gap-3 hover:text-navy-700"
                          >
                            <Avatar name={student.fullName} />
                            <TPrimary sub={student.admissionNo}>{student.fullName}</TPrimary>
                          </Link>
                        </TCell>
                        <TCell>{formatDate(student.removedAt)}</TCell>
                        <TCell>
                          {student.removedWithParent ? (
                            <span className="text-sm text-slate-600">
                              With {student.removedWithParent.name}, their only parent
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">Removed by the office</span>
                          )}
                        </TCell>
                        <TCell numeric>
                          {student.removedWithParent ? (
                            <RestoreButton
                              action={restoreParentAction.bind(
                                null,
                                student.removedWithParent.userId,
                                undefined,
                              )}
                              name={student.removedWithParent.name}
                              label={`Restore with ${student.removedWithParent.name}`}
                            />
                          ) : (
                            <RestoreButton
                              action={restoreStudentAction.bind(null, student.id, 'list')}
                              name={student.fullName}
                            />
                          )}
                        </TCell>
                      </TRow>
                    ))}
                  </tbody>
                </Table>

                <Pagination
                  page={students.page}
                  totalPages={students.totalPages}
                  total={students.total}
                  basePath={listPath}
                />
              </>
            )}
          </Card>

          <Card
            className="mb-6"
            title="Parents"
            description="Signed out and unable to sign in. Restoring one brings back the children removed with them."
          >
            {!removedParents || removedParents.items.length === 0 ? (
              <EmptyState
                title={filtered ? 'No removed parents match that search' : 'No parents removed'}
                description="Parents you remove appear here and can be restored."
              />
            ) : (
              <>
                <Table>
                  <THead
                    columns={['Parent', 'Children', 'Removed', { label: 'Actions', hidden: true }]}
                  />
                  <tbody>
                    {removedParents.items.map((parent) => (
                      <TRow key={parent.userId}>
                        <TCell>
                          <div className="flex items-center gap-3">
                            <Avatar name={parent.name} />
                            <TPrimary sub={parent.phone ?? parent.email ?? undefined}>
                              {parent.name}
                            </TPrimary>
                          </div>
                        </TCell>
                        <TCell>
                          {parent.children.length === 0 ? (
                            <span className="text-slate-400">None</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {parent.children.map((child) => (
                                <Pill key={child.id}>{child.name}</Pill>
                              ))}
                            </span>
                          )}
                        </TCell>
                        <TCell>{formatDate(parent.removedAt)}</TCell>
                        <TCell numeric>
                          <RestoreButton
                            action={restoreParentAction.bind(null, parent.userId, undefined)}
                            name={parent.name}
                          />
                        </TCell>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
                {removedParents.total > removedParents.items.length && (
                  <p className="px-5 py-3 text-xs text-slate-500">
                    Showing {removedParents.items.length} of {removedParents.total}. Search to find
                    the others.
                  </p>
                )}
              </>
            )}
          </Card>
        </>
      ) : (
        <Card className="mb-6">
          {students.items.length === 0 ? (
            <EmptyState
              title={filtered ? 'No students match those filters' : 'No students yet'}
              description={
                filtered
                  ? 'Try a broader search, or clear the filters.'
                  : 'Add a child with their parent — one form for both.'
              }
            />
          ) : (
            <>
              <Table>
                <THead
                  columns={['Student', 'Class', 'Parent / guardian', 'Date of birth', 'State']}
                />
                <tbody>
                  {students.items.map((student) => (
                    <TRow key={student.id}>
                      <TCell>
                        <Link
                          href={`/school/students/${student.id}`}
                          className="flex items-center gap-3 hover:text-navy-700"
                        >
                          <Avatar name={student.fullName} photoUrl={student.avatarUrl} />
                          <TPrimary
                            sub={`${student.admissionNo}${student.rollNo ? ` · roll ${student.rollNo}` : ''}`}
                          >
                            {student.fullName}
                          </TPrimary>
                        </Link>
                      </TCell>
                      <TCell>
                        {student.classroom ? (
                          <span className="block">
                            <span className="block text-sm text-navy-950">
                              {student.classroom.standard}
                            </span>
                            <span className="block text-xs text-slate-500">
                              Section {student.classroom.section}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Not in a class</span>
                        )}
                      </TCell>
                      <TCell>
                        <FamilyCell student={student} />
                      </TCell>
                      <TCell>{formatDate(student.dateOfBirth)}</TCell>
                      <TCell>
                        <Pill tone={student.status === 'ACTIVE' ? 'brand' : 'neutral'}>
                          {student.status.charAt(0) + student.status.slice(1).toLowerCase()}
                        </Pill>
                      </TCell>
                    </TRow>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={students.page}
                totalPages={students.totalPages}
                total={students.total}
                basePath="/school/students"
              />
            </>
          )}
        </Card>
      )}

      <OutcomeToast
        outcome={{ done, who, problem }}
        removed={(name) =>
          `${name} is removed. Attendance, fees and report cards are kept; they are under Removed.`
        }
        restored={(name) => `${name} is back on the roll, without a class — place them in one.`}
        messages={{
          'parent-restored': (name) =>
            `${name} is restored, with any children removed with them. Those children come back without a class — place them in one.`,
        }}
      />
    </>
  );
}
