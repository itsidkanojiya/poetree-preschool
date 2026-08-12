import Link from 'next/link';
import type { ClassroomSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill, StatTile } from '@/components/ui/layout';
import { Table, TCell, THead, TPrimary, TRow } from '@/components/ui/table';
import { IconChart, IconDownload, IconPlan, IconStudent } from '@/components/icons';
import { formatDate, formatPrice } from '@/lib/format';

/**
 * One screen, five reports.
 *
 * A school office asks the same handful of questions — who came in, what came
 * in, what is still owed, who has done their homework — so the reports share a
 * date range and a class filter rather than living on five separate pages with
 * five sets of controls to set again each time.
 */

interface AttendanceRegisterRow {
  date: string;
  classroom: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
  percentage: number;
}

interface StudentAttendanceRow {
  admissionNo: string;
  student: string;
  classroom: string;
  present: number;
  absent: number;
  daysMarked: number;
  percentage: number;
}

interface CollectionRow {
  paymentId: string;
  receiptNo: string;
  paidOn: string;
  student: string;
  admissionNo: string;
  method: string;
  amountInPaise: number;
  recordedBy: string;
}

interface DuesRow {
  admissionNo: string;
  student: string;
  classroom: string;
  invoiceNo: string;
  period: string;
  dueDate: string;
  outstandingInPaise: number;
  daysOverdue: number;
}

interface HomeworkCompletionRow {
  title: string;
  classroom: string;
  dueDate: string;
  assigned: number;
  completed: number;
  pending: number;
  completionPercent: number;
}

interface Summary {
  students: number;
  teachers: number;
  classrooms: number;
  registersTaken: number;
  collectedInPaise: number;
  outstandingInPaise: number;
}

const TABS = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'students', label: 'By student' },
  { key: 'collection', label: 'Collection' },
  { key: 'dues', label: 'Outstanding' },
  { key: 'homework', label: 'Homework' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Which export each tab downloads, keyed to the names the route handler knows. */
const EXPORT_NAME: Record<TabKey, string> = {
  attendance: 'attendance-register',
  students: 'attendance-by-student',
  collection: 'fee-collection',
  dues: 'outstanding-dues',
  homework: 'homework-completion',
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Colour the number, not the row — a 62% register should be visible at a glance. */
function percentTone(value: number): string {
  if (value >= 90) return 'text-leaf-600';
  if (value >= 75) return 'text-navy-950';
  return 'text-rose-600';
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const single = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = new Date();
  const to = single('to') || isoDay(today);
  const from = single('from') || isoDay(new Date(today.getTime() - 29 * 86_400_000));
  const classroomId = single('classroomId') ?? '';
  const tab = (TABS.find((t) => t.key === single('tab'))?.key ?? 'attendance') as TabKey;

  const range = { from, to, ...(classroomId ? { classroomId } : {}) };

  const [classrooms, summary] = await Promise.all([
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<Summary>('/reports/summary', { query: { from, to } }),
  ]);

  // Only the visible report is fetched. Loading all five to render one would
  // make the slowest report the cost of opening the page.
  const rows = await (async () => {
    switch (tab) {
      case 'attendance':
        return apiFetch<{ rows: AttendanceRegisterRow[] }>('/reports/attendance/register', {
          query: range,
        });
      case 'students':
        return apiFetch<{ rows: StudentAttendanceRow[] }>('/reports/attendance/students', {
          query: range,
        });
      case 'collection':
        return apiFetch<{ rows: CollectionRow[] }>('/reports/fees/collection', {
          query: { from, to },
        });
      case 'dues':
        return apiFetch<{ rows: DuesRow[] }>('/reports/fees/dues');
      case 'homework':
        return apiFetch<{ rows: HomeworkCompletionRow[] }>('/reports/homework/completion', {
          query: { from, to },
        });
    }
  })();

  const filterQuery = new URLSearchParams({
    from,
    to,
    ...(classroomId ? { classroomId } : {}),
  });

  const downloadHref = `/school/reports/download?report=${EXPORT_NAME[tab]}&${filterQuery.toString()}`;
  const count = rows.rows.length;

  return (
    <>
      <PageHeader
        title="Reports"
        description="The office view: who came in, what came in, and what is still owed."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Children enrolled"
          value={summary.students}
          icon={<IconStudent size={16} />}
          hint={`${summary.classrooms} class${summary.classrooms === 1 ? '' : 'es'} · ${summary.teachers} teachers`}
        />
        <StatTile
          label="Registers taken"
          value={summary.registersTaken}
          icon={<IconChart size={16} />}
          hint="In the selected range"
        />
        <StatTile
          label="Collected"
          value={formatPrice(summary.collectedInPaise)}
          icon={<IconPlan size={16} />}
          tone="good"
          hint="Receipts issued in the range, refunds netted off"
        />
        <StatTile
          label="Outstanding"
          value={formatPrice(summary.outstandingInPaise)}
          icon={<IconPlan size={16} />}
          tone={summary.outstandingInPaise > 0 ? 'warning' : 'good'}
          hint="Every unpaid invoice, whatever its date"
        />
      </div>

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/reports">
          <input type="hidden" name="tab" value={tab} />

          <div>
            <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-navy-950">
              From
            </label>
            <input
              type="date"
              id="from"
              name="from"
              defaultValue={from}
              className="rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-navy-950 ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-navy-700"
            />
          </div>

          <div>
            <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-navy-950">
              To
            </label>
            <input
              type="date"
              id="to"
              name="to"
              defaultValue={to}
              className="rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-navy-950 ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-navy-700"
            />
          </div>

          <div className="min-w-[13rem]">
            <label htmlFor="classroomId" className="mb-1.5 block text-sm font-medium text-navy-950">
              Class
            </label>
            <select
              id="classroomId"
              name="classroomId"
              defaultValue={classroomId}
              className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-navy-950 ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-navy-700"
            >
              <option value="">Every class</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.classLevel.name} — {classroom.section}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            Apply
          </button>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((item) => {
            const active = item.key === tab;
            const href = `/school/reports?tab=${item.key}&${filterQuery.toString()}`;
            return (
              <Link
                key={item.key}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-inset ring-navy-950/10 hover:bg-navy-50 hover:text-navy-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {count > 0 && (
          <a
            href={downloadHref}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
          >
            <IconDownload size={16} />
            Export CSV
          </a>
        )}
      </div>

      <Card
        title={TABS.find((t) => t.key === tab)?.label}
        description={
          tab === 'dues'
            ? 'Every unpaid invoice, oldest first. Not filtered by the dates above.'
            : `${formatDate(from)} to ${formatDate(to)}`
        }
        action={
          <Pill tone="neutral">
            {count} {count === 1 ? 'row' : 'rows'}
          </Pill>
        }
      >
        {count === 0 ? (
          <EmptyState
            title="Nothing in this range"
            description="Widen the dates, or pick another class."
          />
        ) : (
          <ReportTable tab={tab} rows={rows.rows} />
        )}
      </Card>
    </>
  );
}

function ReportTable({ tab, rows }: { tab: TabKey; rows: unknown[] }) {
  if (tab === 'attendance') {
    return (
      <Table>
        <THead
          columns={[
            'Date',
            'Class',
            { label: 'Present', numeric: true },
            { label: 'Absent', numeric: true },
            { label: 'Late', numeric: true },
            { label: 'Leave', numeric: true },
            { label: 'Total', numeric: true },
            { label: 'Attendance', numeric: true },
          ]}
        />
        <tbody>
          {(rows as AttendanceRegisterRow[]).map((row, index) => (
            <TRow key={`${row.date}-${row.classroom}-${index}`}>
              <TCell>{formatDate(row.date)}</TCell>
              <TCell>{row.classroom}</TCell>
              <TCell numeric>{row.present}</TCell>
              <TCell numeric>{row.absent}</TCell>
              <TCell numeric>{row.late}</TCell>
              <TCell numeric>{row.leave}</TCell>
              <TCell numeric>{row.total}</TCell>
              <TCell numeric className={`font-medium ${percentTone(row.percentage)}`}>
                {row.percentage}%
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    );
  }

  if (tab === 'students') {
    return (
      <Table>
        <THead
          columns={[
            'Child',
            'Class',
            { label: 'Present', numeric: true },
            { label: 'Absent', numeric: true },
            { label: 'Days marked', numeric: true },
            { label: 'Attendance', numeric: true },
          ]}
        />
        <tbody>
          {(rows as StudentAttendanceRow[]).map((row) => (
            <TRow key={row.admissionNo}>
              <TCell>
                <TPrimary sub={row.admissionNo}>{row.student}</TPrimary>
              </TCell>
              <TCell>{row.classroom}</TCell>
              <TCell numeric>{row.present}</TCell>
              <TCell numeric>{row.absent}</TCell>
              <TCell numeric>{row.daysMarked}</TCell>
              <TCell numeric className={`font-medium ${percentTone(row.percentage)}`}>
                {row.percentage}%
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    );
  }

  if (tab === 'collection') {
    return (
      <Table>
        <THead
          columns={[
            'Receipt',
            'Date',
            'Child',
            'Method',
            'Recorded by',
            { label: 'Amount', numeric: true },
          ]}
        />
        <tbody>
          {(rows as CollectionRow[]).map((row) => (
            <TRow key={row.receiptNo}>
              <TCell>
                {/* The number was already here; now it opens the document a
                    parent was actually handed. */}
                <a
                  href={`/school/documents?kind=receipt&id=${row.paymentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-navy-900 hover:text-navy-700"
                >
                  {row.receiptNo}
                </a>
              </TCell>
              <TCell>{formatDate(row.paidOn)}</TCell>
              <TCell>
                <TPrimary sub={row.admissionNo}>{row.student}</TPrimary>
              </TCell>
              <TCell>{row.method.charAt(0) + row.method.slice(1).toLowerCase()}</TCell>
              <TCell>{row.recordedBy}</TCell>
              {/* A refund is a negative payment, so it reads as one rather than
                  disappearing into a netted total. */}
              <TCell
                numeric
                className={`font-medium ${row.amountInPaise < 0 ? 'text-rose-600' : 'text-navy-950'}`}
              >
                {formatPrice(row.amountInPaise)}
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    );
  }

  if (tab === 'dues') {
    return (
      <Table>
        <THead
          columns={[
            'Child',
            'Class',
            'Invoice',
            'Due',
            { label: 'Overdue', numeric: true },
            { label: 'Outstanding', numeric: true },
          ]}
        />
        <tbody>
          {(rows as DuesRow[]).map((row) => (
            <TRow key={row.invoiceNo}>
              <TCell>
                <TPrimary sub={row.admissionNo}>{row.student}</TPrimary>
              </TCell>
              <TCell>{row.classroom}</TCell>
              <TCell>
                <TPrimary sub={row.period}>{row.invoiceNo}</TPrimary>
              </TCell>
              <TCell>{formatDate(row.dueDate)}</TCell>
              <TCell numeric>
                {row.daysOverdue > 0 ? (
                  <span className="font-medium text-rose-600">{row.daysOverdue}d</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </TCell>
              <TCell numeric className="font-medium text-navy-950">
                {formatPrice(row.outstandingInPaise)}
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    );
  }

  return (
    <Table>
      <THead
        columns={[
          'Homework',
          'Class',
          'Due',
          { label: 'Set', numeric: true },
          { label: 'Done', numeric: true },
          { label: 'Pending', numeric: true },
          { label: 'Completion', numeric: true },
        ]}
      />
      <tbody>
        {(rows as HomeworkCompletionRow[]).map((row, index) => (
          <TRow key={`${row.title}-${index}`}>
            <TCell>
              <TPrimary>{row.title}</TPrimary>
            </TCell>
            <TCell>{row.classroom}</TCell>
            <TCell>{formatDate(row.dueDate)}</TCell>
            <TCell numeric>{row.assigned}</TCell>
            <TCell numeric>{row.completed}</TCell>
            <TCell numeric>
              {row.pending > 0 ? (
                <span className="font-medium text-gold-700">{row.pending}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </TCell>
            <TCell numeric className={`font-medium ${percentTone(row.completionPercent)}`}>
              {row.completionPercent}%
            </TCell>
          </TRow>
        ))}
      </tbody>
    </Table>
  );
}
