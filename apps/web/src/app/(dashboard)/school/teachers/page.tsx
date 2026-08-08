import type { Paginated, TeacherSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { Pagination, TCell, THead, TRow, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { TeacherForm } from '../forms';

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const { page = '1', search } = await searchParams;

  const teachers = await apiFetch<Paginated<TeacherSummary>>('/teachers', {
    query: { page, pageSize: 20, search },
  });

  return (
    <>
      <PageHeader title="Teachers" description="Staff at your school." />

      <Card className="mb-6">
        {teachers.items.length === 0 ? (
          <EmptyState title="No teachers yet" description="Add your first teacher below." />
        ) : (
          <>
            <Table>
              <THead columns={['Name', 'Email', 'Phone', 'Employee code', 'Classes', 'Joined', 'Status']} />
              <tbody>
                {teachers.items.map((teacher) => (
                  <TRow key={teacher.userId}>
                    <TCell className="font-medium text-slate-900">{teacher.name}</TCell>
                    <TCell>{teacher.email ?? '—'}</TCell>
                    <TCell>{teacher.phone ?? '—'}</TCell>
                    <TCell>{teacher.employeeCode ?? '—'}</TCell>
                    <TCell>{teacher.classroomCount}</TCell>
                    <TCell>{formatDate(teacher.joinedAt)}</TCell>
                    <TCell>{teacher.status}</TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={teachers.page}
              totalPages={teachers.totalPages}
              total={teachers.total}
              basePath="/school/teachers"
            />
          </>
        )}
      </Card>

      <Card title="Add a teacher">
        <TeacherForm />
      </Card>
    </>
  );
}
