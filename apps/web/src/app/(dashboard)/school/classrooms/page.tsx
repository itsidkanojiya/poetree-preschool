import type {
  AcademicYearSummary,
  ClassroomSummary,
  Paginated,
  TeacherSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { AcademicYearForm, ClassroomForm } from '../forms';

export default async function ClassroomsPage() {
  const [classrooms, academicYears, teachers] = await Promise.all([
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Paginated<TeacherSummary>>('/teachers', { query: { pageSize: 100 } }),
  ]);

  return (
    <>
      <PageHeader
        title="Classrooms"
        description="Sections per class level, within an academic year."
      />

      <Card className="mb-6" title="Academic years">
        {academicYears.length === 0 ? (
          <EmptyState
            title="No academic year yet"
            description="Everything else — classrooms, and later attendance and fees — hangs off this."
          />
        ) : (
          <Table>
            <THead columns={['Year', 'Starts', 'Ends', 'Classrooms', 'Current']} />
            <tbody>
              {academicYears.map((year) => (
                <TRow key={year.id}>
                  <TCell className="font-medium text-slate-900">{year.name}</TCell>
                  <TCell>{formatDate(year.startDate)}</TCell>
                  <TCell>{formatDate(year.endDate)}</TCell>
                  <TCell>{year.classroomCount}</TCell>
                  <TCell>{year.isCurrent ? 'Yes' : '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}

        <div className="mt-6 border-t border-slate-100 pt-6">
          <AcademicYearForm />
        </div>
      </Card>

      <Card className="mb-6" title="Classrooms">
        {classrooms.length === 0 ? (
          <EmptyState title="No classrooms yet" description="Create one below." />
        ) : (
          <Table>
            <THead columns={['Class', 'Section', 'Academic year', 'Class teacher', 'Students', 'Capacity']} />
            <tbody>
              {classrooms.map((classroom) => (
                <TRow key={classroom.id}>
                  <TCell className="font-medium text-slate-900">{classroom.classLevel.name}</TCell>
                  <TCell>{classroom.section}</TCell>
                  <TCell>{classroom.academicYear.name}</TCell>
                  <TCell>{classroom.classTeacher?.name ?? 'Unassigned'}</TCell>
                  <TCell>{classroom.studentCount}</TCell>
                  <TCell>{classroom.capacity ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Add a classroom">
        <ClassroomForm academicYears={academicYears} teachers={teachers.items} />
      </Card>
    </>
  );
}
