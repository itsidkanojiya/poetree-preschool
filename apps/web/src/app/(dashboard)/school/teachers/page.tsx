import type { Paginated, TeacherSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { TeacherForm } from '../forms';
import { ResetPasswordButton } from '../reset-password';

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
      <PageHeader title="Teachers" description="Teaching staff at your school." />

      <Card className="mb-6">
        {teachers.items.length === 0 ? (
          <EmptyState title="No teachers yet" description="Add your first teacher below." />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'Teacher',
                  'Phone',
                  'Employee code',
                  { label: 'Classes', numeric: true },
                  'Joined',
                  'State',
                  'Sign-in',
                ]}
              />
              <tbody>
                {teachers.items.map((teacher) => (
                  <TRow key={teacher.userId}>
                    <TCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={teacher.name} />
                        <TPrimary sub={teacher.email ?? undefined}>{teacher.name}</TPrimary>
                      </div>
                    </TCell>
                    <TCell>{teacher.phone ?? '—'}</TCell>
                    <TCell>{teacher.employeeCode ?? '—'}</TCell>
                    <TCell numeric>{teacher.classroomCount}</TCell>
                    <TCell>{formatDate(teacher.joinedAt)}</TCell>
                    <TCell>
                      <Pill tone={teacher.status === 'ACTIVE' ? 'brand' : 'neutral'}>
                        {teacher.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Pill>
                    </TCell>
                    <TCell>
                      <ResetPasswordButton
                        kind="teachers"
                        userId={teacher.userId}
                        name={teacher.name}
                      />
                    </TCell>
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

      <div className="max-w-3xl">
        <Card title="Add a teacher">
          <TeacherForm />
        </Card>
      </div>
    </>
  );
}
