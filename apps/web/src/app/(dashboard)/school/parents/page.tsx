import type { Paginated, ParentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import Link from 'next/link';
import { IconPlus } from '@/components/icons';
import { ResetPasswordButton } from '../reset-password';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

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
        action={
          <Link href="/school/parents/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
            <IconPlus size={17} />
            Add parent
          </Link>
        }
      />

      <Card className="mb-6">
        {parents.items.length === 0 ? (
          <EmptyState
            title="No parents yet"
            description="Add a parent before adding students — every child is linked to a guardian."
          />
        ) : (
          <>
            <Table>
              <THead columns={['Parent', 'Phone', 'Relation', 'Children', 'State', 'Sign-in']} />
              <tbody>
                {parents.items.map((parent) => (
                  <TRow key={parent.userId}>
                    <TCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={parent.name} />
                        <TPrimary sub={parent.email ?? undefined}>{parent.name}</TPrimary>
                      </div>
                    </TCell>
                    <TCell>{parent.phone ?? '—'}</TCell>
                    <TCell>{titleCase(parent.relation)}</TCell>
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
                    <TCell>
                      <Pill tone={parent.status === 'ACTIVE' ? 'brand' : 'neutral'}>
                        {parent.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Pill>
                    </TCell>
                    <TCell>
                      <ResetPasswordButton
                        kind="parents"
                        userId={parent.userId}
                        name={parent.name}
                      />
                    </TCell>
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
    </>
  );
}
