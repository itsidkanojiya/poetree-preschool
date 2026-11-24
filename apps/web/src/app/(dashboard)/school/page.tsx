import Link from 'next/link';
import type { ReactNode } from 'react';
import { apiFetch, getCurrentUser } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/format';
import { BarList, ColumnChart, Ring } from '@/components/charts';
import {
  IconCake,
  IconChart,
  IconChevronRight,
  IconClassroom,
  IconClipboard,
  IconClock,
  IconIdCard,
  IconMegaphone,
  IconRupee,
  IconStudent,
  IconTeacher,
  IconUserPlus,
} from '@/components/icons';

interface Birthday {
  id: string;
  name: string;
  classroom: string | null;
  date: string;
  turning: number;
}

interface Overview {
  students: number;
  newThisMonth: number;
  teachers: number;
  parents: number;
  classrooms: number;
  fees: { billedInPaise: number; collectedInPaise: number; outstandingInPaise: number };
  feesByMonth: Array<{ month: string; collectedInPaise: number }>;
  attendanceToday: { present: number; absent: number; marked: number; enrolled: number };
  classSizes: Array<{ classroomId: string; label: string; count: number }>;
  attention: { registrations: number; payments: number; overdue: number };
  birthdays: { today: Birthday[]; soon: Birthday[] };
  announcements: Array<{ id: string; title: string; publishAt: string }>;
}

/** ₹3.2L, ₹1.1Cr — how an Indian office reads a large sum at a glance. */
function inLakhs(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`;
  return formatPrice(paise);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (yearMonth: string) => MONTHS[Number(yearMonth.slice(5, 7)) - 1]!;
const dayMonth = (monthDay: string) =>
  `${Number(monthDay.slice(3, 5))} ${MONTHS[Number(monthDay.slice(0, 2)) - 1]}`;

/** The school's time of day, for the greeting. */
function greeting(): { hello: string; today: string } {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })
      .format(now)
      .replace(/\D/g, ''),
  );
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(now);
  return { hello, today };
}

const TILE = {
  sky: 'from-sky-500 to-sky-600',
  violet: 'from-violet-500 to-violet-600',
  amber: 'from-amber-400 to-amber-500',
  emerald: 'from-emerald-500 to-emerald-600',
} as const;

/** A big, coloured figure with its icon — the first thing the office sees. */
function KpiTile({
  label,
  value,
  hint,
  icon,
  tone,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone: keyof typeof TILE;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br ${TILE[tone]} p-4 text-white sm:p-5 shadow-raised transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy-300`}
    >
      <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" aria-hidden="true" />
      <span className="absolute -bottom-8 right-8 h-20 w-20 rounded-full bg-white/10" aria-hidden="true" />
      <span className="relative flex items-center gap-2 text-sm font-semibold text-white/90">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">{icon}</span>
        {label}
      </span>
      <span className="relative mt-4 block truncate font-display text-3xl font-extrabold leading-none sm:text-4xl">
        {value}
      </span>
      {hint && <span className="relative mt-2 block text-sm text-white/90">{hint}</span>}
    </Link>
  );
}

/** A white panel with a coloured mark beside its title. */
function Panel({
  title,
  icon,
  tone,
  action,
  children,
  className = '',
}: {
  title: string;
  icon: ReactNode;
  tone: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy-950/[0.06] ${className}`}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-lg font-extrabold text-navy-950">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</span>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function SeeAll({ href, label = 'See all' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-sky-700 hover:text-sky-900"
    >
      {label}
      <IconChevronRight size={16} />
    </Link>
  );
}

/**
 * The school's front page: how big it is, the year's money, today, what is
 * waiting, and the jobs done most — every figure a way in to the page behind it.
 */
export default async function SchoolOverviewPage() {
  const [user, overview] = await Promise.all([
    getCurrentUser(),
    apiFetch<Overview>('/dashboard/overview'),
  ]);
  const { hello, today } = greeting();
  const { fees, attendanceToday: register, attention } = overview;
  const collectedShare =
    fees.billedInPaise > 0 ? Math.min(1, fees.collectedInPaise / fees.billedInPaise) : 0;
  const waiting = attention.registrations + attention.payments + attention.overdue;
  const isNew = overview.students === 0;

  const quickLinks = [
    { href: '/school/students/new', label: 'Add student', icon: <IconUserPlus size={20} />, tone: 'bg-sky-50 text-sky-700' },
    { href: '/school/fees/payment', label: 'Take a payment', icon: <IconRupee size={20} />, tone: 'bg-emerald-50 text-emerald-700' },
    { href: '/school/notices', label: 'Post an announcement', icon: <IconMegaphone size={20} />, tone: 'bg-amber-50 text-amber-700' },
    { href: '/school/classrooms', label: 'Print ID cards', icon: <IconIdCard size={20} />, tone: 'bg-violet-50 text-violet-700' },
    { href: '/school/reports', label: 'Reports', icon: <IconChart size={20} />, tone: 'bg-rose-50 text-rose-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-700">{today}</p>
          <h1 className="font-display text-[1.9rem] font-extrabold leading-tight text-navy-950">
            {hello}, {user.school?.name ?? 'your school'} 👋
          </h1>
        </div>
      </header>

      {/* The four figures */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          tone="sky"
          href="/school/students"
          label="Total students"
          icon={<IconStudent size={20} />}
          value={overview.students.toLocaleString('en-IN')}
          hint={
            overview.newThisMonth > 0
              ? `+${overview.newThisMonth} joined this month`
              : `${overview.parents.toLocaleString('en-IN')} parents`
          }
        />
        <KpiTile
          tone="violet"
          href="/school/teachers"
          label="Teachers"
          icon={<IconTeacher size={20} />}
          value={overview.teachers}
          hint="Teaching this year"
        />
        <KpiTile
          tone="amber"
          href="/school/classrooms"
          label="Classrooms"
          icon={<IconClassroom size={20} />}
          value={overview.classrooms}
          hint="This academic year"
        />
        <KpiTile
          tone="emerald"
          href="/school/fees"
          label="Fees this year"
          icon={<IconRupee size={20} />}
          value={inLakhs(fees.collectedInPaise)}
          hint={
            fees.billedInPaise > 0 ? (
              <>
                of {inLakhs(fees.billedInPaise)} billed
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{ width: `${collectedShare * 100}%` }}
                  />
                </span>
              </>
            ) : (
              'Nothing billed yet'
            )
          }
        />
      </div>

      {/* What is waiting */}
      <section
        aria-label="Needs your attention"
        className={`rounded-3xl p-4 ring-1 ${
          waiting > 0 ? 'bg-rose-50 ring-rose-100' : 'bg-emerald-50 ring-emerald-100'
        }`}
      >
        {waiting === 0 ? (
          <p className="flex items-center gap-2 px-2 py-1 font-semibold text-emerald-800">
            ✓ Nothing is waiting on you. Everything is up to date.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-2 font-display text-base font-extrabold text-rose-800">
              Needs your attention
            </span>
            {[
              {
                count: attention.registrations,
                label: attention.registrations === 1 ? 'registration waiting' : 'registrations waiting',
                href: '/school/registrations',
                icon: <IconClipboard size={18} />,
              },
              {
                count: attention.payments,
                label: attention.payments === 1 ? 'payment to approve' : 'payments to approve',
                href: '/school/fees/to-approve',
                icon: <IconRupee size={18} />,
              },
              {
                count: attention.overdue,
                label: attention.overdue === 1 ? 'fee past its due date' : 'fees past their due date',
                href: '/school/fees/follow-ups',
                icon: <IconClock size={18} />,
              },
            ]
              .filter((item) => item.count > 0)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-navy-950 shadow-card ring-1 ring-rose-100 transition hover:ring-rose-300"
                >
                  <span className="text-rose-600">{item.icon}</span>
                  <span className="font-display text-lg font-extrabold text-rose-700">{item.count}</span>
                  {item.label}
                  <IconChevronRight size={16} className="text-slate-400" />
                </Link>
              ))}
          </div>
        )}
      </section>

      {isNew && (
        <section className="rounded-3xl bg-sky-50 p-5 ring-1 ring-sky-100">
          <h2 className="font-display text-lg font-extrabold text-navy-950">Getting started</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ['1', 'Create the year and classrooms', '/school/classrooms'],
              ['2', 'Add your teachers', '/school/teachers'],
              ['3', 'Add students and their parents', '/school/students/new'],
            ].map(([step, label, href]) => (
              <li key={href}>
                <Link
                  href={href!}
                  className="flex min-h-[56px] items-center gap-3 rounded-2xl bg-white px-4 py-3 font-semibold text-navy-950 shadow-card hover:ring-2 hover:ring-sky-300"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-600 text-sm font-bold text-white">
                    {step}
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Money, month by month */}
        <Panel
          className="lg:col-span-2"
          title="Fees collected, month by month"
          icon={<IconRupee size={18} />}
          tone="bg-emerald-50 text-emerald-700"
          action={<SeeAll href="/school/fees" label="Fees" />}
        >
          {overview.feesByMonth.some((m) => m.collectedInPaise !== 0) ? (
            <>
              <p className="-mt-2 mb-4 text-sm text-slate-500">
                This month:{' '}
                <span className="font-bold text-emerald-700">
                  {formatPrice(overview.feesByMonth.at(-1)?.collectedInPaise ?? 0)}
                </span>
                {fees.outstandingInPaise > 0 && (
                  <>
                    {' '}
                    · Still to come this year:{' '}
                    <span className="font-bold text-navy-950">
                      {formatPrice(fees.outstandingInPaise)}
                    </span>
                  </>
                )}
              </p>
              <ColumnChart
                label="Fees collected in each of the last twelve months"
                tone="emerald"
                format={formatPrice}
                data={overview.feesByMonth.map((m) => ({
                  label: monthName(m.month),
                  value: m.collectedInPaise,
                }))}
              />
            </>
          ) : (
            <Empty
              text="No fees taken in the last twelve months."
              action={{ href: '/school/fees/structure', label: 'Set up the fee structure' }}
            />
          )}
        </Panel>

        {/* Today */}
        <Panel
          title="Today’s attendance"
          icon={<IconClock size={18} />}
          tone="bg-sky-50 text-sky-700"
        >
          {register.marked > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <Ring value={register.present} total={register.marked} tone="sky" caption="present" />
              <dl className="grid w-full grid-cols-3 gap-2 text-center">
                <Figure label="Present" value={register.present} tone="text-sky-700" />
                <Figure label="Absent" value={register.absent} tone="text-rose-600" />
                <Figure
                  label="Not marked"
                  value={Math.max(register.enrolled - register.marked, 0)}
                  tone="text-slate-600"
                />
              </dl>
            </div>
          ) : (
            <Empty text="No register has been marked today yet. Teachers mark it in the app." />
          )}
        </Panel>

        {/* Classes */}
        <Panel
          className="lg:col-span-2"
          title="Children in each class"
          icon={<IconClassroom size={18} />}
          tone="bg-violet-50 text-violet-700"
          action={<SeeAll href="/school/classrooms" label="Classrooms" />}
        >
          {overview.classSizes.length > 0 ? (
            <BarList
              tone="violet"
              rows={overview.classSizes.map((c) => ({ label: c.label, value: c.count }))}
            />
          ) : (
            <Empty
              text="No children are in a class this year yet."
              action={{ href: '/school/classrooms', label: 'Open classrooms' }}
            />
          )}
        </Panel>

        {/* The jobs done most */}
        <Panel title="Quick links" icon={<IconChart size={18} />} tone="bg-rose-50 text-rose-700">
          <ul className="grid grid-cols-2 gap-2.5">
            {quickLinks.map((link) => (
              <li key={link.href} className="odd:last:col-span-2">
                <Link
                  href={link.href}
                  className="flex min-h-[88px] flex-col items-start justify-between gap-2 rounded-2xl p-3 ring-1 ring-navy-950/[0.06] transition hover:-translate-y-0.5 hover:shadow-raised"
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${link.tone}`}>
                    {link.icon}
                  </span>
                  <span className="text-sm font-bold leading-tight text-navy-950">{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Birthdays */}
        <Panel title="Birthdays" icon={<IconCake size={18} />} tone="bg-amber-50 text-amber-700">
          {overview.birthdays.today.length + overview.birthdays.soon.length === 0 ? (
            <Empty text="No birthdays in the next seven days." />
          ) : (
            <ul className="space-y-2">
              {overview.birthdays.today.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/school/students/${b.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100"
                  >
                    <span className="text-2xl" aria-hidden="true">
                      🎂
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-navy-950">{b.name}</span>
                      <span className="block text-xs text-amber-800">
                        Today · turns {b.turning}
                        {b.classroom && ` · ${b.classroom}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {overview.birthdays.soon.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/school/students/${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-navy-950">{b.name}</span>
                      <span className="block text-xs text-slate-500">{b.classroom ?? 'No class yet'}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                      {dayMonth(b.date)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Announcements */}
        <Panel
          className="lg:col-span-2"
          title="Recent announcements"
          icon={<IconMegaphone size={18} />}
          tone="bg-amber-50 text-amber-700"
          action={<SeeAll href="/school/notices" />}
        >
          {overview.announcements.length === 0 ? (
            <Empty
              text="No announcements yet."
              action={{ href: '/school/notices', label: 'Post one' }}
            />
          ) : (
            <ul className="divide-y divide-navy-950/[0.06]">
              {overview.announcements.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="truncate font-semibold text-navy-950">{a.title}</span>
                  <span className="shrink-0 text-sm text-slate-500">{formatDate(a.publishAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-2 py-2.5">
      <dd className={`font-display text-2xl font-extrabold ${tone}`}>{value}</dd>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed border-navy-950/10 bg-slate-50/60 px-4 py-6 text-center">
      <p className="text-sm text-slate-600">{text}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
