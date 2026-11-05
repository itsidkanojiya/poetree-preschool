import Link from 'next/link';
import type {
  AcademicYearSummary,
  ClassroomSummary,
  Paginated,
  StudentSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconPlus, IconSearch } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { TabStrip } from '@/components/ui/tab-strip';
import { restoreStudentAction } from '../removal-actions';
import { RestoreButton } from '../restore-button';
import { OutcomeToast } from '../outcome-toast';
import { ExcelExportButton } from '@/components/excel-export';

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

  // The classroom filter still needs the list of classrooms; the parents were
  // only ever for the add form, which now fetches its own.
  const [students, classrooms, years, standards] = await Promise.all([
    apiFetch<Paginated<StudentSummary>>('/students', {
      query: showRemoved
        ? { page, pageSize: 20, search, removed: 'true' }
        : { page, pageSize: 20, search, classroomId },
    }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
  ]);

  const filtered = Boolean(search || (!showRemoved && classroomId));

  return (
    <>
      <PageHeader
        title="Students"
        description="Children enrolled at your school."
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
            <Link href="/school/students/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
              <IconPlus size={17} />
              Add student
            </Link>
          </div>
        }
      />

      <TabStrip
        current={showRemoved ? 'removed' : 'current'}
        tabs={[
          { key: 'current', label: 'On the roll', href: '/school/students' },
          { key: 'removed', label: 'Removed', href: '/school/students?removed=true' },
        ]}
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/students">
          {showRemoved && <input type="hidden" name="removed" value="true" />}
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="student-search" className="mb-1.5 block text-sm font-medium text-navy-950">
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
                placeholder="Name or admission number"
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

      <Card className="mb-6">
        {students.items.length === 0 ? (
          showRemoved ? (
            <EmptyState
              title={filtered ? 'No removed children match that search' : 'Nobody removed'}
              description="Children you remove appear here, with their records kept, and can be restored."
            />
          ) : (
            <EmptyState
              title={filtered ? 'No students match those filters' : 'No students yet'}
              description={
                filtered
                  ? 'Try a broader search, or clear the filters.'
                  : 'Add a parent first, then add their child.'
              }
            />
          )
        ) : showRemoved ? (
          <>
            <Table>
              <THead
                columns={[
                  'Student',
                  'Admission no.',
                  'Guardian',
                  'Removed',
                  { label: 'Actions', hidden: true },
                ]}
              />
              <tbody>
                {students.items.map((student) => (
                  <TRow key={student.id}>
                    <TCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={student.fullName} />
                        <TPrimary>{student.fullName}</TPrimary>
                      </div>
                    </TCell>
                    <TCell>
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {student.admissionNo}
                      </code>
                    </TCell>
                    <TCell>
                      {student.guardians.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {student.guardians.map((guardian) => (
                            <Pill
                              key={guardian.parentProfileId}
                              tone={guardian.isPrimary ? 'gold' : 'neutral'}
                            >
                              {guardian.name}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </TCell>
                    <TCell>{formatDate(student.removedAt)}</TCell>
                    <TCell numeric>
                      <RestoreButton
                        action={restoreStudentAction.bind(null, student.id, 'list')}
                        name={student.fullName}
                      />
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
        ) : (
          <>
            <Table>
              <THead
                columns={['Student', 'Admission no.', 'Class', 'Date of birth', 'Guardian', 'State']}
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
                        <TPrimary sub={student.rollNo ? `Roll ${student.rollNo}` : undefined}>
                          {student.fullName}
                        </TPrimary>
                      </Link>
                    </TCell>
                    <TCell>
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {student.admissionNo}
                      </code>
                    </TCell>
                    <TCell>
                      {student.classroom?.label ?? (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </TCell>
                    <TCell>{formatDate(student.dateOfBirth)}</TCell>
                    <TCell>
                      {student.guardians.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {student.guardians.map((guardian) => (
                            <Pill
                              key={guardian.parentProfileId}
                              tone={guardian.isPrimary ? 'gold' : 'neutral'}
                            >
                              {guardian.name}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </TCell>
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

      <OutcomeToast
        outcome={{ done, who, problem }}
        removed={(name) =>
          `${name} is removed. Attendance, fees and report cards are kept; they are under Removed.`
        }
        restored={(name) => `${name} is back on the roll, without a class — place them in one.`}
      />
    </>
  );
}
