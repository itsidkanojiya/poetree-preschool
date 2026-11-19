import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconSchool,
  IconStudent,
  IconTeacher,
} from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import type { Paginated, SchoolSummary } from '@poetree/shared';

interface Overview {
  schools: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    expiringSoon: number;
  };
  students: number;
  teachers: number;
  /** The schools to act on: expiring within 30 days first, then blocked. */
  attention: Array<{
    id: string;
    name: string;
    code: string;
    city: string | null;
    status: string;
    reason: 'EXPIRING' | 'SUSPENDED' | 'EXPIRED';
    expiresAt: string | null;
  }>;
}

/** Counts as people read them here: 1,20,000, not 120000. */
const count = (value: number) => value.toLocaleString('en-IN');

/** One focus style for everything clickable, so keyboard users never lose their place. */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2';

/**
 * A headline number that is also the way in to the list behind it — every
 * tile answers "which ones?" with one click instead of a trip to the menu.
 */
function KpiTile({
  href,
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'critical' | 'good';
}) {
  const accent = {
    default: 'bg-navy-50 text-navy-700',
    warning: 'bg-gold-50 text-gold-700',
    critical: 'bg-rose-50 text-rose-600',
    good: 'bg-leaf-50 text-leaf-700',
  }[tone];

  return (
    <Link
      href={href}
      className={`group block rounded-2xl bg-white p-4 shadow-card sm:p-5 ring-1 ring-navy-950/[0.07] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:ring-navy-950/15 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accent}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold leading-none tracking-tight text-navy-950">
        {count(value)}
      </p>
      <p className="mt-2.5 flex items-center justify-between gap-2 text-xs leading-relaxed text-slate-500">
        <span>{hint}</span>
        <IconChevronRight
          size={15}
          className="shrink-0 text-slate-300 transition-colors group-hover:text-navy-700"
          aria-hidden="true"
        />
      </p>
    </Link>
  );
}

const STATUS_PARTS = [
  { key: 'ACTIVE', label: 'Active', field: 'active', bar: 'bg-leaf-500', dot: 'bg-leaf-500' },
  { key: 'TRIAL', label: 'Trial', field: 'trial', bar: 'bg-navy-500', dot: 'bg-navy-500' },
  {
    key: 'SUSPENDED',
    label: 'Suspended',
    field: 'suspended',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
  },
  { key: 'EXPIRED', label: 'Expired', field: 'expired', bar: 'bg-gold-400', dot: 'bg-gold-400' },
] as const;

/**
 * Where every school stands, as one bar of the whole.
 *
 * A stacked bar rather than a pie: four statuses read better side by side, and
 * the bar is only a picture — every number is written beside its label, so
 * nothing depends on telling the colours apart. Each row opens the list of
 * those schools.
 */
function StatusBreakdown({ schools }: { schools: Overview['schools'] }) {
  const total = Math.max(schools.total, 1);
  const summary = STATUS_PARTS.map(
    (part) => `${schools[part.field]} ${part.label.toLowerCase()}`,
  ).join(', ');

  return (
    <Card title="Schools by status" description={`${count(schools.total)} schools on the platform`}>
      <div
        role="img"
        aria-label={`Schools by status: ${summary}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {STATUS_PARTS.map((part) =>
          schools[part.field] > 0 ? (
            <span
              key={part.key}
              className={`${part.bar} h-full border-r-2 border-white last:border-r-0`}
              style={{ width: `${(schools[part.field] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-5 divide-y divide-navy-950/[0.06]">
        {STATUS_PARTS.map((part) => {
          const value = schools[part.field];
          return (
            <li key={part.key}>
              <Link
                href={`/publication/schools?status=${part.key}`}
                className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-navy-50 ${FOCUS}`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${part.dot}`}
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm text-navy-950">{part.label}</span>
                <span className="text-sm font-semibold tabular-nums text-navy-950">
                  {count(value)}
                </span>
                <span className="w-11 text-right text-xs tabular-nums text-slate-500">
                  {Math.round((value / total) * 100)}%
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Why a school is on the list, in words and an icon as well as a colour. */
function Reason({ item }: { item: Overview['attention'][number] }) {
  if (item.reason !== 'EXPIRING') return <StatusBadge status={item.status} />;
  const days = daysUntil(item.expiresAt) ?? 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-2.5 py-1 text-xs font-medium text-gold-900 ring-1 ring-inset ring-gold-200">
      <IconClock size={13} strokeWidth={2} aria-hidden="true" />
      {days <= 1 ? 'Ends tomorrow' : `Ends in ${days} days`}
    </span>
  );
}

/**
 * The schools to act on, by name: expiring soonest first — those can still be
 * saved — then the ones already cut off. A count alone sent the office to the
 * full list to find them.
 */
function NeedsAttention({ overview }: { overview: Overview }) {
  const { schools, attention } = overview;
  const waiting = schools.expiringSoon + schools.suspended + schools.expired;

  return (
    <Card
      title="Needs attention"
      description="Renew before access is cut on the expiry date, or reactivate a blocked school."
      action={
        waiting > attention.length ? (
          <Link
            href="/publication/schools"
            className={`inline-flex items-center gap-1 rounded-md text-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
          >
            All {count(waiting)} <IconChevronRight size={15} aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      {attention.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-leaf-50 px-4 py-4 text-sm text-leaf-900 ring-1 ring-inset ring-leaf-200">
          <IconCheck size={18} className="shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-medium">Every school is in good standing.</span>
            Nothing expires in the next 30 days and nobody is blocked.
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-navy-950/[0.06]">
          {attention.map((item) => (
            <li key={item.id}>
              <Link
                href={`/publication/schools/${item.id}`}
                className={`-mx-2 flex flex-col gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-navy-50 sm:flex-row sm:items-center sm:gap-4 ${FOCUS}`}
              >
                {/* The name wraps rather than being cut short: on a phone it is
                    the one thing on the row that has to be read in full. */}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-navy-950 [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.city ?? item.code}
                    {item.expiresAt && <> · access ends {formatDate(item.expiresAt)}</>}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-4 sm:contents">
                  <Reason item={item} />
                  <span className="inline-flex items-center gap-0.5 text-sm font-medium text-navy-700">
                    Manage <IconChevronRight size={15} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The newest schools — streamed in after the numbers, which matter more. */
async function RecentSchools() {
  const recent = await apiFetch<Paginated<SchoolSummary>>('/publication/schools', {
    query: { pageSize: 6 },
  });

  return (
    <Card
      title="Recently added"
      description="The newest schools on the platform."
      action={
        <Link
          href="/publication/schools"
          className={`inline-flex items-center gap-1 rounded-md text-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
        >
          View all <IconChevronRight size={15} aria-hidden="true" />
        </Link>
      }
    >
      {recent.items.length === 0 ? (
        <EmptyState
          title="No schools yet"
          description="Add the first school to start onboarding Poetree's customers."
          action={
            <Link
              href="/publication/schools/new"
              className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 ${FOCUS}`}
            >
              <IconPlus size={17} aria-hidden="true" />
              Add school
            </Link>
          }
        />
      ) : (
        <Table>
          <THead
            columns={[
              'School',
              'Status',
              'Access ends',
              { label: 'Students', numeric: true },
              { label: 'Manage', hidden: true },
            ]}
          />
          <tbody>
            {recent.items.map((school) => (
              <TRow key={school.id}>
                <TCell>
                  <TPrimary sub={school.city ?? school.code}>{school.name}</TPrimary>
                </TCell>
                <TCell>
                  <StatusBadge status={school.status} />
                </TCell>
                <TCell>{formatDate(school.expiresAt)}</TCell>
                <TCell numeric>
                  <span className="tabular-nums">{count(school.counts.students)}</span>
                </TCell>
                <TCell className="text-right">
                  <Link
                    href={`/publication/schools/${school.id}`}
                    className={`rounded-md text-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
                  >
                    Manage
                  </Link>
                </TCell>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/** Holds the table's place while it loads, so nothing below it jumps. */
function RecentSchoolsSkeleton() {
  return (
    <Card title="Recently added" description="The newest schools on the platform.">
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none"
          />
        ))}
      </div>
      <span className="sr-only">Loading the newest schools…</span>
    </Card>
  );
}

/**
 * The publisher's first screen: how many schools, which ones need action
 * today, and where every school stands — each number a way into its list.
 */
export default async function PublicationOverviewPage() {
  const overview = await apiFetch<Overview>('/publication/overview');
  const { schools } = overview;
  const blocked = schools.suspended + schools.expired;
  const waiting = schools.expiringSoon + blocked;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every school on the Poetree platform, at a glance."
        action={
          <Link
            href="/publication/schools/new"
            className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
          >
            <IconPlus size={17} aria-hidden="true" />
            Add school
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          href="/publication/schools"
          label="Schools"
          value={schools.total}
          icon={<IconSchool size={18} aria-hidden="true" />}
          hint={`${count(schools.active)} active · ${count(schools.trial)} on trial`}
        />
        <KpiTile
          href="#needs-attention"
          label="Need attention"
          value={waiting}
          tone={blocked > 0 ? 'critical' : waiting > 0 ? 'warning' : 'good'}
          icon={
            waiting > 0 ? (
              <IconAlert size={18} aria-hidden="true" />
            ) : (
              <IconCheck size={18} aria-hidden="true" />
            )
          }
          hint={
            waiting > 0
              ? `${count(schools.expiringSoon)} expiring · ${count(blocked)} blocked`
              : 'All schools in good standing'
          }
        />
        <KpiTile
          href="/publication/usage"
          label="Students"
          value={overview.students}
          icon={<IconStudent size={18} aria-hidden="true" />}
          hint="Across every school"
        />
        <KpiTile
          href="/publication/usage"
          label="Teachers"
          value={overview.teachers}
          icon={<IconTeacher size={18} aria-hidden="true" />}
          hint="Across every school"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div id="needs-attention" className="scroll-mt-6 lg:col-span-3">
          <NeedsAttention overview={overview} />
        </div>
        <div className="lg:col-span-2">
          <StatusBreakdown schools={schools} />
        </div>
      </div>

      <div className="mt-6">
        <Suspense fallback={<RecentSchoolsSkeleton />}>
          <RecentSchools />
        </Suspense>
      </div>
    </>
  );
}
