import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { SchoolAdminSummary, SchoolBookRow, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Avatar, Card, EmptyState, Notice, Pill, StatusBadge } from '@/components/ui/layout';
import { TabStrip } from '@/components/ui/tab-strip';
import { Toast } from '@/components/ui/toast';
import { IconArrowLeft, IconChevronRight } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import { SchoolBooksPanel } from '../../books/forms';
import { Check, FOCUS, Readiness } from '../../readiness';
import {
  CreateAdminPanel,
  DeleteSchoolPanel,
  LogoPanel,
  ReactivatePanel,
  SchoolDetailsForm,
  SuspendPanel,
  ValidityPanel,
} from './panels';

export const metadata: Metadata = { title: 'School · Poetree Admin' };

interface SuspensionImpact {
  schoolId: string;
  schoolName: string;
  users: number;
  activeSessions: number;
}

const TABS = ['overview', 'accounts', 'access', 'books', 'details'] as const;
type Tab = (typeof TABS)[number];

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`;

/** One thing left to do before the school is ready, and the way to it. */
function ToDo({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-navy-950">{title}</span>
        <span className="block text-sm text-slate-500">{children}</span>
      </span>
      <Link
        href={href}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
      >
        {action}
        <IconChevronRight size={15} aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * One school: whether it is ready, then its sections.
 *
 * The set-up strip answers the question this page is opened for — is this
 * school ready to use? — before any tab is chosen: an administrator who has
 * signed in, books chosen, a logo, and when access ends. Each fact opens the
 * tab that changes it.
 *
 * The sections are addresses rather than client state, so a save comes back to
 * the tab it was made on and a URL can be handed to somebody else.
 */
export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; done?: string; users?: string }>;
}) {
  const { id } = await params;
  const { tab: requested, done, users } = await searchParams;

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
  const signedIn = admins.some((admin) => admin.lastLoginAt);

  const href = (next: Tab) => `/publication/schools/${id}?tab=${next}`;

  const accessValue =
    school.status === 'SUSPENDED'
      ? 'Suspended'
      : lapsed
        ? 'Date passed'
        : school.validUntil
          ? `${formatDate(school.validUntil)}${remaining !== null && remaining <= 30 ? ` · ${plural(remaining, 'day', 'days')} left` : ''}`
          : 'No end date';

  const toDo = [
    blocked && (
      <ToDo key="access" title="Nobody here can sign in" href={href('access')} action="Open Access">
        {school.status === 'SUSPENDED'
          ? 'The school was suspended by hand.'
          : 'Their access date has passed. Set a later one to let them back in.'}
      </ToDo>
    ),
    admins.length === 0 && (
      <ToDo key="admin" title="No administrator yet" href={href('accounts')} action="Add one">
        Nobody can run this school until there is one.
      </ToDo>
    ),
    admins.length > 0 && !signedIn && (
      <ToDo
        key="signin"
        title="The administrator has never signed in"
        href={href('accounts')}
        action="Accounts"
      >
        Check the password reached them.
      </ToDo>
    ),
    enabledBooks === 0 && (
      <ToDo key="books" title="No books chosen" href={href('books')} action="Choose books">
        Their app shows an empty shelf until a book is switched on.
      </ToDo>
    ),
    !school.logoUrl && (
      <ToDo key="logo" title="No logo" href={href('details')} action="Add a logo">
        The app shows the school’s initials instead.
      </ToDo>
    ),
  ].filter(Boolean);

  return (
    <>
      {/* Header: who this is, and whether they can use it — beside the name. */}
      <div className="mb-6">
        <Link
          href="/publication/schools"
          className={`mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
        >
          <IconArrowLeft size={16} aria-hidden="true" />
          All schools
        </Link>
        <div className="flex items-center gap-4">
          {school.logoUrl ? (
            <img
              src={school.logoUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain ring-1 ring-navy-950/10"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy-50 font-display text-xl font-extrabold text-navy-800 ring-1 ring-navy-950/10"
            >
              {school.name
                .split(/\s+/)
                .filter((word) => /^[A-Za-z]/.test(word))
                .slice(0, 2)
                .map((word) => word[0]!.toUpperCase())
                .join('') || 'S'}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-navy-950 [overflow-wrap:anywhere]">
                {school.name}
              </h1>
              <StatusBadge status={school.status} />
              {lapsed && school.status !== 'EXPIRED' && <Pill tone="gold">Access date passed</Pill>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              School ID{' '}
              <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                {school.code}
              </code>
              {school.city && <> · {school.city}</>} · added {formatDate(school.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <Readiness label="Set-up">
        <Check
          label="Administrator"
          value={admins.length === 0 ? 'None yet' : signedIn ? 'Signed in' : 'Never signed in'}
          state={signedIn ? 'done' : 'todo'}
          href={href('accounts')}
        />
        <Check
          label="Books"
          value={enabledBooks === 0 ? 'None chosen' : plural(enabledBooks, 'book', 'books')}
          state={enabledBooks === 0 ? 'todo' : 'done'}
          href={href('books')}
        />
        <Check
          label="Logo"
          value={school.logoUrl ? 'Uploaded' : 'Not yet'}
          state={school.logoUrl ? 'done' : 'todo'}
          href={href('details')}
        />
        <Check
          label="Access ends"
          value={accessValue}
          state={blocked ? 'todo' : 'info'}
          href={href('access')}
        />
        <Check
          label="Students"
          value={school.counts.students.toLocaleString('en-IN')}
          state="info"
        />
        <Check
          label="Teachers"
          value={school.counts.teachers.toLocaleString('en-IN')}
          state="info"
        />
      </Readiness>

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
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card
            title={toDo.length > 0 ? 'To finish setting up' : 'Ready'}
            description={
              toDo.length > 0
                ? `${plural(toDo.length, 'thing', 'things')} before this school is fully set up.`
                : 'An administrator who has signed in, books on the shelf and a logo.'
            }
          >
            {toDo.length > 0 ? (
              <ul className="divide-y divide-navy-950/[0.06]">{toDo}</ul>
            ) : (
              <Notice tone="success" title="Nothing left to set up.">
                Change anything from the tabs above.
              </Notice>
            )}
          </Card>

          <Card title="People">
            <dl className="divide-y divide-navy-950/[0.06] text-sm">
              {[
                ['Students', school.counts.students],
                ['Teachers', school.counts.teachers],
                ['Administrators', admins.length],
                ['All accounts', school.counts.users],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-medium tabular-nums text-navy-950">
                    {Number(value).toLocaleString('en-IN')}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
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
              /* A list, not a table: a handful of people was never tabular data. */
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
                        /* An account made weeks ago and never used is usually
                           a password that never reached anybody. */
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
            description="A School Admin runs this school's teachers, parents and students."
          >
            <CreateAdminPanel schoolId={school.id} />
          </Card>
        </div>
      )}

      {tab === 'access' && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card
            title="Access ends"
            description="The date this school's access stops. Nothing else decides it."
          >
            <ValidityPanel school={school} />
          </Card>

          <Card
            tone={blocked ? 'default' : 'danger'}
            title={blocked ? 'Restore access' : 'Suspend this school'}
            description={
              blocked
                ? 'This school is blocked. Nobody there can sign in.'
                : 'Signs out everyone at the school at once, and keeps them out until you restore access.'
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
          <div className="space-y-5">
            <Card title="School details">
              <SchoolDetailsForm school={school} />
            </Card>

            {/* Last on the last tab: the one thing here that cannot be undone. */}
            <Card tone="danger" title="Delete this school">
              <DeleteSchoolPanel school={school} />
            </Card>
          </div>

          <Card
            title="Logo"
            description="Shown on their app's sign-in screen and beside their name everywhere."
          >
            <LogoPanel school={school} />
          </Card>
        </div>
      )}

      {/* After suspending or restoring: the panel that did it has been
          replaced, so the outcome is said here. */}
      {done === 'suspended' && (
        <Toast
          message={`School suspended. ${plural(Number(users) || 0, 'person was', 'people were')} signed out.`}
        />
      )}
      {done === 'reactivated' && (
        <Toast message="School reactivated. Everyone there can sign in again." />
      )}
    </>
  );
}
