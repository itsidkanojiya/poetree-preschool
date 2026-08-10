import Link from 'next/link';
import type {
  AcademicYearSummary,
  ClassroomSummary,
  Paginated,
  TeacherSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { NewPeriodForm, TimetableGrid } from './grid';

interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

interface Entry {
  dayOfWeek: number;
  periodId: string;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
}

interface Subject {
  id: string;
  name: string;
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const { classroomId } = await searchParams;

  const [classrooms, years, teachers, subjects] = await Promise.all([
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Paginated<TeacherSummary>>('/teachers', { query: { pageSize: 100 } }),
    apiFetch<Subject[]>('/subjects'),
  ]);

  if (classrooms.length === 0) {
    return (
      <>
        <PageHeader title="Timetable" />
        <Card>
          <EmptyState
            title="No classrooms yet"
            description="Create an academic year and a classroom before building a timetable."
          />
        </Card>
      </>
    );
  }

  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0]!;
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];

  const timetable = await apiFetch<{ periods: Period[]; entries: Entry[] }>(
    `/timetable/classrooms/${selected.id}`,
  );

  return (
    <>
      <PageHeader
        title="Timetable"
        description="One weekly grid per class. Teacher and room clashes are refused on save."
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/timetable">
          <div className="min-w-[15rem]">
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
                  {classroom.classLevel.name} — {classroom.section}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
          >
            Show
          </button>
          <Link
            href="/school/classrooms"
            className="px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-navy-900"
          >
            Manage classes
          </Link>
        </form>
      </Card>

      <Card
        title={`${selected.classLevel.name} — ${selected.section}`}
        description={selected.academicYear.name}
      >
        <TimetableGrid
          classroomId={selected.id}
          periods={timetable.periods}
          entries={timetable.entries}
          subjects={subjects}
          teachers={teachers.items.map((t) => ({ id: t.userId, name: t.name }))}
          rooms={[]}
        />
      </Card>

      {currentYear && (
        <div className="mt-5 max-w-3xl">
          <Card
            title="The school day"
            description="Periods are shared by every class in the year."
          >
            <NewPeriodForm academicYearId={currentYear.id} />
          </Card>
        </div>
      )}
    </>
  );
}
