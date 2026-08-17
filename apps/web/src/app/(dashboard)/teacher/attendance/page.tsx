import Link from 'next/link';
import type { AttendanceSheet } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { Register } from './register';

interface MyClassroom {
  id: string;
  label: string;
  studentCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string; date?: string }>;
}) {
  const { classroomId, date = today() } = await searchParams;

  const classrooms = await apiFetch<MyClassroom[]>('/me/classrooms');

  if (classrooms.length === 0) {
    return (
      <>
        <PageHeader title="Attendance" />
        <EmptyState
          title="You are not assigned to a class yet"
          description="Ask the school office to assign you as a class teacher."
        />
      </>
    );
  }

  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0]!;
  const sheet = await apiFetch<AttendanceSheet>('/attendance/sheet', {
    query: { classroomId: selected.id, date },
  });

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Everyone starts present — tap only the children who are not."
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/teacher/attendance">
          <div className="min-w-[13rem]">
            <label htmlFor="classroomId" className="mb-1.5 block text-sm font-medium text-navy-950">
              Class
            </label>
            <select
              id="classroomId"
              name="classroomId"
              defaultValue={selected.id}
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-3.5 pr-9 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600"
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.label} ({classroom.studentCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-navy-950">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              max={today()}
              className="rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600"
            />
          </div>

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
          >
            Show
          </button>

          {date !== today() && (
            <Link
              href="/teacher/attendance"
              className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
            >
              Back to today
            </Link>
          )}
        </form>
      </Card>

      <Card
        title={sheet.classroomLabel}
        description={new Date(`${sheet.date}T00:00:00Z`).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })}
        action={sheet.alreadyMarked ? <StatusBadge status="ACTIVE" /> : undefined}
      >
        <Register sheet={sheet} />
      </Card>
    </>
  );
}
