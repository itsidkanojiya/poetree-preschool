import type { ClassroomSummary, Paginated, ParentSummary } from '@poetree/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { IconPlus, IconSearch } from '@/components/icons';
import { ChangePasswordButton } from '../change-password';
import { OutcomeToast } from '../outcome-toast';
import { StatusToggle } from '../status-toggle';
import { ExcelExportButton } from '@/components/excel-export';
import { StudentsSectionTabs } from '../students/section-tabs';
import { RemoveParentButton } from '../students/parent-removal';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Every parent account, as a tab of Students.
 *
 * A parent is managed from their child's page now, where the family is. This
 * list is for the accounts as accounts: who can sign in, a new password,
 * exporting them, and finding which child a number belongs to.
 */
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

  // Removed parents live beside removed children now, under Students → Removed.
  if (removed === 'true') {
    const query = new URLSearchParams({ removed: 'true' });
    for (const [key, value] of Object.entries({ search, done, who, problem })) {
      if (value) query.set(key, value);
    }
    redirect(`/school/students?${query.toString()}`);
  }

  const [parents, classrooms, standards] = await Promise.all([
    apiFetch<Paginated<ParentSummary>>('/parents', {
      query: { page, pageSize: 20, search },
    }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
  ]);

  return (
    <>
      <PageHeader
        title="Students"
        description="Every parent account. To add a parent, add their child — or open the child and link one."
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

      <StudentsSectionTabs current="parents" />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/parents">
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor="parent-search"
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
                id="parent-search"
                name="search"
                defaultValue={search}
                placeholder="Parent’s name, mobile or email"
                className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
          >
            Apply
          </button>
          {search && (
            <Link
              href="/school/parents"
              className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Card className="mb-6">
        {parents.items.length === 0 ? (
          <EmptyState
            title={search ? 'No parents match that search' : 'No parents yet'}
            description={
              search
                ? 'Try part of the name or the number.'
                : 'Parents are added with their child, from Add student.'
            }
          />
        ) : (
          <>
            <Table>
              <THead
                columns={[
                  'Parent',
                  'Mobile',
                  'Relation',
                  'Children',
                  'State',
                  'Sign-in',
                  { label: 'Actions', hidden: true },
                ]}
              />
              <tbody>
                {parents.items.map((parent) => {
                  const onRoll = parent.children.filter((child) => !child.removed);
                  return (
                    <TRow key={parent.userId}>
                      <TCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={parent.name} />
                          <TPrimary sub={parent.email ?? undefined}>{parent.name}</TPrimary>
                          {parent.isTeacher && <Pill>Also a teacher</Pill>}
                        </div>
                      </TCell>
                      <TCell>{parent.phone ?? '—'}</TCell>
                      <TCell>{titleCase(parent.relation)}</TCell>
                      <TCell>
                        {onRoll.length === 0 ? (
                          <span className="text-slate-400">None on the roll</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {/* The child's page is where this parent is managed. */}
                            {onRoll.map((child) => (
                              <Link key={child.id} href={`/school/students/${child.id}`}>
                                <Pill tone={child.isPrimary ? 'gold' : 'neutral'}>
                                  {child.name}
                                </Pill>
                              </Link>
                            ))}
                          </span>
                        )}
                      </TCell>
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
                        <RemoveParentButton parent={parent} />
                      </TCell>
                    </TRow>
                  );
                })}
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

      <OutcomeToast
        outcome={{ done, who, problem }}
        removed={(name) => `${name} is removed. Their children stay with their other parents.`}
        restored={(name) => `${name} is restored.`}
      />
    </>
  );
}
