import Link from 'next/link';
import type { AttendanceSheet, HomeworkSummary, NoticeSummary, Paginated } from '@poetree/shared';
import { apiFetch, getCurrentUser } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/layout';
import { IconChevronRight, IconClassroom, IconStudent } from '@/components/icons';
import { formatDate } from '@/lib/format';

interface MyClassroom {
  id: string;
  label: string;
  studentCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export default async function TeacherTodayPage() {
  const [user, classrooms] = await Promise.all([
    getCurrentUser(),
    apiFetch<MyClassroom[]>('/me/classrooms'),
  ]);

  // Whether each class has been marked yet is the thing a teacher is checking.
  const sheets = await Promise.all(
    classrooms.map((classroom) =>
      apiFetch<AttendanceSheet>('/attendance/sheet', {
        query: { classroomId: classroom.id, date: today() },
      }),
    ),
  );

  const [homework, notices] = await Promise.all([
    apiFetch<Paginated<HomeworkSummary>>('/homework', { query: { pageSize: 5 } }),
    apiFetch<Paginated<NoticeSummary>>('/notices', { query: { pageSize: 5 } }),
  ]);

  const children = classrooms.reduce((sum, c) => sum + c.studentCount, 0);
  const pendingRegisters = sheets.filter((sheet) => !sheet.alreadyMarked && !sheet.isHoliday).length;

  return (
    <>
      <PageHeader
        title={`Good morning, ${user.name.split(' ')[0]}`}
        description={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="My classes" value={classrooms.length} icon={<IconClassroom size={17} />} />
        <StatTile label="Children" value={children} icon={<IconStudent size={17} />} />
        <StatTile
          label="Registers to take"
          value={pendingRegisters}
          tone={pendingRegisters > 0 ? 'warning' : 'good'}
          hint={pendingRegisters === 0 ? 'All done for today' : 'Not yet marked today'}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card title="Today's registers">
          {classrooms.length === 0 ? (
            <EmptyState
              title="No classes assigned"
              description="Ask the school office to assign you as a class teacher."
            />
          ) : (
            <ul className="space-y-2">
              {classrooms.map((classroom, index) => {
                const sheet = sheets[index]!;
                return (
                  <li key={classroom.id}>
                    <Link
                      href={`/teacher/attendance?classroomId=${classroom.id}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-navy-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-navy-950">
                          {classroom.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {classroom.studentCount} children ·{' '}
                          {sheet.isHoliday
                            ? (sheet.holidayTitle ?? 'Holiday')
                            : sheet.alreadyMarked
                              ? 'Register taken'
                              : 'Not marked yet'}
                        </span>
                      </span>
                      <IconChevronRight
                        size={17}
                        className="shrink-0 text-slate-300 group-hover:text-navy-600"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent homework">
          {homework.items.length === 0 ? (
            <EmptyState title="No homework set yet" />
          ) : (
            <ul className="space-y-2">
              {homework.items.map((item) => (
                <li key={item.id} className="rounded-xl px-3 py-2.5 hover:bg-navy-50">
                  <p className="text-sm font-medium text-navy-950">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.classroom.label} · due {formatDate(item.dueDate)} ·{' '}
                    {item.progress.pending} pending of {item.progress.total}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Notices" className="xl:col-span-2">
          {notices.items.length === 0 ? (
            <EmptyState title="Nothing from the school office" />
          ) : (
            <ul className="space-y-2">
              {notices.items.map((notice) => (
                <li key={notice.id} className="rounded-xl px-3 py-2.5 hover:bg-navy-50">
                  <p className="text-sm font-medium text-navy-950">
                    {notice.pinned && <span className="mr-1.5 text-gold-600">★</span>}
                    {notice.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notice.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
