import type { Paginated, ParentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { Pagination, TCell, THead, TRow, Table } from '@/components/ui/table';
import { ParentForm } from '../forms';

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const { page = '1', search } = await searchParams;

  const parents = await apiFetch<Paginated<ParentSummary>>('/parents', {
    query: { page, pageSize: 20, search },
  });

  return (
    <>
      <PageHeader
        title="Parents"
        description="Parents own the family login. Children are profiles under their account."
      />

      <Card className="mb-6">
        {parents.items.length === 0 ? (
          <EmptyState title="No parents yet" description="Add a parent before adding students." />
        ) : (
          <>
            <Table>
              <THead columns={['Name', 'Phone', 'Email', 'Relation', 'Children', 'Status']} />
              <tbody>
                {parents.items.map((parent) => (
                  <TRow key={parent.userId}>
                    <TCell className="font-medium text-slate-900">{parent.name}</TCell>
                    <TCell>{parent.phone ?? '—'}</TCell>
                    <TCell>{parent.email ?? '—'}</TCell>
                    <TCell>{parent.relation}</TCell>
                    <TCell>
                      {parent.children.length === 0
                        ? '—'
                        : parent.children.map((child) => child.name).join(', ')}
                    </TCell>
                    <TCell>{parent.status}</TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={parents.page}
              totalPages={parents.totalPages}
              total={parents.total}
              basePath="/school/parents"
            />
          </>
        )}
      </Card>

      <Card title="Add a parent">
        <ParentForm />
      </Card>
    </>
  );
}
