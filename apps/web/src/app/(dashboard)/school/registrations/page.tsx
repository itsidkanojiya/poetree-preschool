import type { Metadata } from 'next';
import type { ClassroomSummary, Paginated, RegistrationSummary } from '@poetree/shared';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { Pagination, TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { DecideButtons } from './decide';

export const metadata: Metadata = { title: 'Registrations · Poetree' };

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

const TABS: Array<{ key: string; label: string }> = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Turned down' },
];

/**
 * Families who have asked to be let in.
 *
 * A request no longer names a child on the roll — a family joining the school
 * has no admission number, because the office has not issued one yet. So the
 * screen shows what the family said, and beside it the children already here
 * who might be the same child. Deciding between those is the office's job, and
 * this is where they do it.
 */
export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const { page = '1', search, status = 'PENDING' } = await searchParams;

  const [registrations, classrooms] = await Promise.all([
    apiFetch<Paginated<RegistrationSummary>>('/registrations', {
      query: { page, pageSize: 20, search, status },
    }),
    // Offered when the office creates the child on the spot. A preschool has a
    // handful, so this is one small request rather than a search box.
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  return (
    <>
      <PageHeader
        title="Registrations"
        description="Parents who registered themselves. Nobody can sign in until you approve them."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/school/registrations?status=${tab.key}`}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              status === tab.key
                ? 'bg-navy-900 text-white'
                : 'text-navy-900 ring-1 ring-navy-200 hover:bg-navy-50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {status === 'PENDING' && registrations.items.length > 0 && (
        <div className="mb-5">
          <Notice tone="warning" title="Check the child before you approve">
            Approving lets this person see everything about that child — attendance, fees,
            homework and photographs. The admission number matched, which is not the same as
            knowing they are the parent.
          </Notice>
        </div>
      )}

      <Card className="mb-6">
        {registrations.items.length === 0 ? (
          <EmptyState
            title={
              status === 'PENDING' ? 'Nothing waiting' : `No ${TABS.find((t) => t.key === status)?.label.toLowerCase()} registrations`
            }
            description={
              status === 'PENDING'
                ? 'When a parent registers from the app, their request appears here.'
                : 'Nothing has reached this state yet.'
            }
          />
        ) : (
          <>
            <Table>
              <THead
                columns={['Who is asking', 'The child', 'On the roll', 'Sent', '']}
              />
              <tbody>
                {registrations.items.map((row) => (
                  <TRow key={row.id}>
                    <TCell>
                      <TPrimary sub={`${titleCase(row.relation)} · ${row.phone}`}>
                        {row.guardianName}
                      </TPrimary>
                    </TCell>

                    <TCell>
                      <span className="block text-sm text-navy-950">{row.studentName}</span>
                      <span className="block text-xs text-slate-500">
                        {row.studentDateOfBirth
                          ? `Born ${new Date(row.studentDateOfBirth).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}`
                          : 'No date of birth given'}
                      </span>
                    </TCell>

                    {/* Decided: the child it became. Waiting: who it might be,
                        which is the question the office is about to answer. */}
                    <TCell>
                      {row.student ? (
                        <span className="flex items-center gap-2">
                          <Avatar
                            name={row.student.name}
                            size="sm"
                            photoUrl={row.student.photoUrl}
                          />
                          <span>
                            <span className="block text-sm text-navy-950">
                              {row.student.name}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {row.student.admissionNo}
                              {row.student.classroom && <> · {row.student.classroom}</>}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {row.matches.length === 0
                            ? 'New to the school'
                            : `${row.matches.length} possible ${
                                row.matches.length === 1 ? 'match' : 'matches'
                              }`}
                        </span>
                      )}
                    </TCell>

                    <TCell>
                      <span className="text-xs text-slate-500">
                        {new Date(row.submittedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </TCell>

                    <TCell>
                      {row.status === 'PENDING' ? (
                        <DecideButtons
                          registrationId={row.id}
                          guardianName={row.guardianName}
                          studentName={row.studentName}
                          matches={row.matches}
                          classrooms={classrooms.map((classroom) => ({
                            id: classroom.id,
                            label: `${classroom.classLevel.name} — ${classroom.section}`,
                          }))}
                        />
                      ) : (
                        <span className="flex flex-col gap-1">
                          <Pill tone={row.status === 'APPROVED' ? 'brand' : 'neutral'}>
                            {row.status === 'APPROVED' ? 'Approved' : 'Turned down'}
                          </Pill>
                          {row.reviewedBy && (
                            <span className="text-[11px] text-slate-500">
                              by {row.reviewedBy}
                            </span>
                          )}
                          {row.rejectionReason && (
                            <span className="text-[11px] text-slate-500">
                              {row.rejectionReason}
                            </span>
                          )}
                        </span>
                      )}
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={registrations.page}
              totalPages={registrations.totalPages}
              total={registrations.total}
              basePath={`/school/registrations?status=${status}`}
            />
          </>
        )}
      </Card>
    </>
  );
}
