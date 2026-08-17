import Link from 'next/link';
import type {
  Paginated,
  PlanSummary,
  SchoolAdminSummary,
  SchoolBookRow,
  SchoolSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import {
  Card,
  EmptyState,
  Meter,
  PageHeader,
  Pill,
  StatTile,
  StatusBadge,
} from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { TabStrip } from '@/components/ui/tab-strip';
import { IconArrowLeft, IconStudent, IconTeacher } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import { SchoolBooksPanel } from '../../books/forms';
import {
  CreateAdminPanel,
  LogoPanel,
  ReactivatePanel,
  SchoolDetailsForm,
  SuspendPanel,
  ValidityPanel,
} from './panels';

interface SuspensionImpact {
  schoolId: string;
  schoolName: string;
  users: number;
  activeSessions: number;
}

const TABS = ['overview', 'accounts', 'access', 'books', 'details'] as const;
type Tab = (typeof TABS)[number];

/**
 * One school, in sections.
 *
 * This was nine cards in one column: seat meters, a suspend button, a validity
 * date, a form that creates an administrator, the book entitlements, a logo
 * upload and the school's name and colour. Everything was on screen at once and
 * so nothing was — the destructive control sat a scroll away from a colour
 * picker, and the answer to "can they sign in" was three cards down from the
 * date that decides it.
 *
 * The sections are addresses rather than client state, so a save comes back to
 * the tab it was made on and a URL can be handed to somebody else.
 */
export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requested } = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(requested ?? '')
    ? (requested as Tab)
    : 'overview';

  const [school, plans, impact, schoolBooks, admins] = await Promise.all([
    apiFetch<SchoolSummary>(`/publication/schools/${id}`),
    apiFetch<Paginated<PlanSummary>>('/publication/plans', { query: { pageSize: 100 } }),
    apiFetch<SuspensionImpact>(`/publication/schools/${id}/suspension-impact`),
    apiFetch<SchoolBookRow[]>(`/publication/schools/${id}/books`),
    apiFetch<SchoolAdminSummary[]>(`/publication/schools/${id}/admins`),
  ]);

  const blocked = school.status === 'SUSPENDED' || school.status === 'EXPIRED';
  const remaining = daysUntil(school.expiresAt);

  // Seat limits come from the plan currently assigned to this school.
  const currentPlan = plans.items.find((plan) => plan.name === school.planName) ?? null;
  const enabledBooks = schoolBooks.filter((row) => row.enabled).length;

  const href = (next: Tab) => `/publication/schools/${id}?tab=${next}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/schools"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All schools
          </Link>
        }
        title={school.name}
        description={`Created ${formatDate(school.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Pill tone="neutral">{school.code}</Pill>
            <StatusBadge status={school.status} />
          </div>
        }
      />

      <TabStrip
        current={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'accounts', label: 'Accounts', href: href('accounts'), badge: admins.length },
          { key: 'access', label: 'Access', href: href('access') },
          { key: 'books', label: 'Books', href: href('books'), badge: enabledBooks },
          { key: 'details', label: 'Details', href: href('details') },
        ]}
      />

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Plan"
              value={school.planName ?? 'None'}
              tone={blocked ? 'critical' : 'default'}
              hint={
                school.expiresAt
                  ? remaining !== null && remaining > 0
                    ? `Expires ${formatDate(school.expiresAt)} · ${remaining} days left`
                    : `Expired ${formatDate(school.expiresAt)}`
                  : 'No plan assigned yet'
              }
            />
            <StatTile
              label="Users"
              value={school.counts.users}
              hint="Admins, teachers and parents"
            />
            <StatTile
              label="Students"
              value={school.counts.students}
              icon={<IconStudent size={17} />}
            />
            <StatTile
              label="Teachers"
              value={school.counts.teachers}
              icon={<IconTeacher size={17} />}
            />
          </div>

          {currentPlan && (
            <div className="mt-4">
              <Card
                title="Plan usage"
                description={`Seat limits from the ${currentPlan.name} plan.`}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Meter
                    label="Students"
                    used={school.counts.students}
                    limit={currentPlan.maxStudents}
                  />
                  <Meter
                    label="Teachers"
                    used={school.counts.teachers}
                    limit={currentPlan.maxTeachers}
                  />
                </div>
              </Card>
            </div>
          )}

          {blocked && (
            <div className="mt-4">
              <Card
                title="Nobody here can sign in"
                description="Put that right under Access."
              >
                <Link
                  href={href('access')}
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
                >
                  Open Access
                </Link>
              </Card>
            </div>
          )}
        </>
      )}

      {tab === 'accounts' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card
            title="Administrators"
            description="Who can sign in to this school and run it."
          >
            {admins.length === 0 ? (
              <EmptyState
                title="No administrator yet"
                description="Nobody can sign in to this school. Create one beside this."
              />
            ) : (
              <Table>
                <THead columns={['Name', 'Signs in with', 'Last signed in', 'State']} />
                <tbody>
                  {admins.map((admin) => (
                    <TRow key={admin.id}>
                      <TCell>{admin.name}</TCell>
                      <TCell>
                        <span className="text-sm">{admin.email ?? admin.phone ?? '—'}</span>
                      </TCell>
                      <TCell>
                        {admin.lastLoginAt ? (
                          formatDate(admin.lastLoginAt)
                        ) : (
                          /* The useful half: an account made weeks ago and
                             never used is usually a password that never
                             reached anybody. */
                          <span className="text-amber-700">Never</span>
                        )}
                      </TCell>
                      <TCell>
                        {admin.status === 'ACTIVE' ? (
                          <Pill tone="brand">Active</Pill>
                        ) : (
                          <Pill tone="neutral">{admin.status === 'SUSPENDED' ? 'Suspended' : 'Inactive'}</Pill>
                        )}
                      </TCell>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card
            title="Add an administrator"
            description="A School Admin manages this school's teachers, parents and students."
          >
            <CreateAdminPanel schoolId={school.id} />
          </Card>
        </div>
      )}

      {tab === 'access' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card
            title="Access"
            description="How long this school can use the product. Nothing else gates them."
          >
            <ValidityPanel school={school} />
          </Card>

          <Card
            tone={blocked ? 'default' : 'danger'}
            title={blocked ? 'Restore access' : 'Access control'}
            description={
              blocked
                ? 'This school is blocked. Nobody there can sign in.'
                : 'Switching the plan off blocks every user of this school immediately.'
            }
          >
            {blocked ? (
              <ReactivatePanel school={school} />
            ) : (
              <SuspendPanel school={school} impact={impact} />
            )}
          </Card>
        </div>
      )}

      {tab === 'books' && (
        <div className="max-w-3xl">
          <Card
            title="Books"
            description="What this school bought. Only these appear in their app."
          >
            <SchoolBooksPanel schoolId={school.id} rows={schoolBooks} />
          </Card>
        </div>
      )}

      {tab === 'details' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="School details">
            <SchoolDetailsForm school={school} />
          </Card>

          <Card
            title="Logo"
            description="Shown on their app's sign-in screen and beside their name everywhere."
          >
            <LogoPanel school={school} />
          </Card>
        </div>
      )}
    </>
  );
}
