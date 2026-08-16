import Link from 'next/link';
import type { Metadata } from 'next';
import type { AcademicYearSummary, Paginated, TeacherSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { ClassroomForm } from '../../forms';

export const metadata: Metadata = { title: 'Add a classroom · Poetree' };

export default async function NewClassroomPage() {
  const [academicYears, teachers, classLevels] = await Promise.all([
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Paginated<TeacherSummary>>('/teachers', { query: { pageSize: 100 } }),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/classrooms"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All classrooms
          </Link>
        }
        title="Add a classroom"
        description="One section of one year — Nursery A. Attendance, fees and the timetable all hang off it."
      />
      <div className="max-w-3xl">
        <Card>
          <ClassroomForm
            academicYears={academicYears}
            teachers={teachers.items}
            classLevels={classLevels}
          />
        </Card>
      </div>
    </>
  );
}
