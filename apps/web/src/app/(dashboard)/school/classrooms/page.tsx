import type {
  AcademicYearSummary,
  ClassroomSummary,
  Paginated,
  TeacherSummary,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
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

      <Card className="mb-6" title="Classrooms">
        {classrooms.length === 0 ? (
          <EmptyState
            title="No classrooms yet"
            description="Create an academic year first, then add sections."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Class',
                'Section',
                'Academic year',
                'Class teacher',
                { label: 'Students', numeric: true },
                { label: 'Capacity', numeric: true },
              ]}
            />
            <tbody>
              {classrooms.map((classroom) => (
                <TRow key={classroom.id}>
                  <TCell>
                    <TPrimary>{classroom.classLevel.name}</TPrimary>
                  </TCell>
                  <TCell>
                    <Pill tone="brand">{classroom.section}</Pill>
                  </TCell>
                  <TCell>{classroom.academicYear.name}</TCell>
                  <TCell>
                    {classroom.classTeacher?.name ?? (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </TCell>
                  <TCell numeric>{classroom.studentCount}</TCell>
                  <TCell numeric>{classroom.capacity ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-6" title="Academic years">
        {academicYears.length === 0 ? (
          <EmptyState
            title="No academic year yet"
            description="Classrooms belong to a year — and so will attendance and fees in later phases."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Year',
                'Starts',
                'Ends',
                { label: 'Classrooms', numeric: true },
                'Current',
              ]}
            />
            <tbody>
              {academicYears.map((year) => (
                <TRow key={year.id}>
                  <TCell>
                    <TPrimary>{year.name}</TPrimary>
                  </TCell>
                  <TCell>{formatDate(year.startDate)}</TCell>
                  <TCell>{formatDate(year.endDate)}</TCell>
                  <TCell numeric>{year.classroomCount}</TCell>
                  <TCell>
                    {year.isCurrent ? <Pill tone="gold">Current</Pill> : <span className="text-slate-400">—</span>}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Add a classroom">
          <ClassroomForm academicYears={academicYears} teachers={teachers.items} />
        </Card>
        <Card title="Add an academic year">
          <AcademicYearForm />
        </Card>
      </div>
    </>
  );
}
