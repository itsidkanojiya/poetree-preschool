import type { ClassroomSummary, Paginated, ParentSummary, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { Pagination, TCell, THead, TRow, Table } from '@/components/ui/table';
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

  return (
    <>
      <PageHeader title="Students" description="Children enrolled at your school." />

      <form className="mb-4 flex flex-wrap gap-2" action="/school/students">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by name or admission number"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="classroomId"
          defaultValue={classroomId ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All classrooms</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.classLevel.name} — {classroom.section}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Filter
        </button>
      </form>

      <Card className="mb-6">
        {students.items.length === 0 ? (
          <EmptyState title="No students yet" description="Add a parent, then add their child." />
        ) : (
          <>
            <Table>
              <THead
                columns={['Name', 'Admission no.', 'Class', 'Date of birth', 'Guardian', 'Status']}
              />
              <tbody>
                {students.items.map((student) => (
                  <TRow key={student.id}>
                    <TCell className="font-medium text-slate-900">{student.fullName}</TCell>
                    <TCell className="font-mono text-xs">{student.admissionNo}</TCell>
                    <TCell>{student.classroom?.label ?? 'Unassigned'}</TCell>
                    <TCell>{formatDate(student.dateOfBirth)}</TCell>
                    <TCell>
                      {student.guardians.length === 0
                        ? '—'
                        : student.guardians
                            .map((guardian) => `${guardian.name}${guardian.isPrimary ? ' ★' : ''}`)
                            .join(', ')}
                    </TCell>
                    <TCell>{student.status}</TCell>
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

      <Card title="Add a student">
        <StudentForm parents={parents.items} classrooms={classrooms} />
      </Card>
    </>
  );
}
