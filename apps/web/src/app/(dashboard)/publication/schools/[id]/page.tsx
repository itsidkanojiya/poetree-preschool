import Link from 'next/link';
import type { SchoolAdminSummary, SchoolBookRow, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  Pill,
  StatTile,
  StatusBadge,
} from '@/components/ui/layout';
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

  const [school, impact, schoolBooks, admins] = await Promise.all([
    apiFetch<SchoolSummary>(`/publication/schools/${id}`),
    apiFetch<SuspensionImpact>(`/publication/schools/${id}/suspension-impact`),
    apiFetch<SchoolBookRow[]>(`/publication/schools/${id}/books`),
    apiFetch<SchoolAdminSummary[]>(`/publication/schools/${id}/admins`),
  ]);

  /**
   * Whether they can sign in, which is not quite what the stored status says.
   *
   * Expiry is lazy: a school whose date has passed is still stored ACTIVE until
   * somebody there makes a request, and only then flipped. So the badge can read
   * Active for a school that is already locked out — and reading the date here
   * is the difference between the screen being right and being reassuring.
   */
  const lapsed = school.validUntil !== null && new Date(school.validUntil).getTime() <= Date.now();
  const blocked = school.status === 'SUSPENDED' || school.status === 'EXPIRED' || lapsed;

  const remaining = daysUntil(school.validUntil);
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
            {/* Was the plan, which this product no longer has. The date is
                what actually decides whether anybody here can sign in. */}
            <StatTile
              label="Access"
              value={school.validUntil ? formatDate(school.validUntil) : 'No end date'}
              tone={blocked ? 'critical' : 'default'}
              hint={
                school.status === 'SUSPENDED'
                  ? 'Suspended by hand — nobody can sign in'
                  : !school.validUntil
                    ? 'They can use it indefinitely'
                    : lapsed
                      ? 'That date has passed — nobody can sign in'
                      : `${remaining} ${remaining === 1 ? 'day' : 'days'} left`
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

          {blocked && (
            <div className="mt-4">
              <Card
                title="Nobody here can sign in"
                description={
                  school.status === 'SUSPENDED'
                    ? 'This school was suspended by hand.'
                    : 'Their access date has passed. Set a later one to let them back in.'
                }
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
        /* items-start, so a card with one person in it does not stretch to
           match the form beside it. */
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card title="Administrators" description="Who can sign in to this school and run it.">
            {admins.length === 0 ? (
              <EmptyState
                title="No administrator yet"
                description="Nobody can sign in to this school. Create one beside this."
              />
            ) : (
              /* A list, not a table. Four columns in a half-width card grew a
                 sideways scrollbar and hid the last of them behind it — and a
                 handful of people was never tabular data in the first place. */
              <ul className="divide-y divide-navy-950/[0.06]">
                {admins.map((admin) => (
                  <li
                    key={admin.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={admin.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-950">{admin.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {admin.email ?? admin.phone ?? 'No email or phone on file'}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {admin.status !== 'ACTIVE' && (
                        <Pill tone="neutral">
                          {admin.status === 'SUSPENDED' ? 'Suspended' : 'Inactive'}
                        </Pill>
                      )}
                      {admin.lastLoginAt ? (
                        <span className="text-xs text-slate-500">
                          Last signed in {formatDate(admin.lastLoginAt)}
                        </span>
                      ) : (
                        /* The diagnostic half: an account made weeks ago and
                           never used is usually a password that never reached
                           anybody. */
                        <Pill tone="gold">Never signed in</Pill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
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
        <div className="grid items-start gap-5 xl:grid-cols-2">
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
        <div className="grid items-start gap-5 xl:grid-cols-2">
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
