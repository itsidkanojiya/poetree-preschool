import Link from 'next/link';
import type { ClassroomSummary, Paginated, ParentSummary, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconSearch } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { StudentForm } from '../forms';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; classroomId?: string }>;
}) {
  const { page = '1', search, classroomId } = await searchParams;

  const [students, parents, classrooms] = await Promise.all([
    apiFetch<Paginated<StudentSummary>>('/students', {
      query: { page, pageSize: 20, search, classroomId },
    }),
    apiFetch<Paginated<ParentSummary>>('/parents', { query: { pageSize: 100 } }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  const filtered = Boolean(search || classroomId);

  return (
    <>
      <PageHeader title="Students" description="Children enrolled at your school." />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/students">
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

          <div className="w-56">
            <label htmlFor="student-class" className="mb-1.5 block text-sm font-medium text-navy-950">
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

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
          >
            Apply
          </button>

          {filtered && (
            <Link
              href="/school/students"
              className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Card className="mb-6">
        {students.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No students match those filters' : 'No students yet'}
            description={
              filtered
                ? 'Try a broader search, or clear the filters.'
                : 'Add a parent first, then add their child.'
            }
          />
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
                      <div className="flex items-center gap-3">
                        <Avatar name={student.fullName} />
                        <TPrimary sub={student.rollNo ? `Roll ${student.rollNo}` : undefined}>
                          {student.fullName}
                        </TPrimary>
                      </div>
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

      <div className="max-w-3xl">
        <Card title="Add a student">
          <StudentForm parents={parents.items} classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
