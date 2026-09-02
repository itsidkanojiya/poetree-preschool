import Link from 'next/link';
import type { AcademicYearSummary, ClassroomSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { IconPlus } from '@/components/icons';
import { ClassSetupTabs } from './tabs';

export default async function ClassroomsPage() {
  const [classrooms, academicYears] = await Promise.all([
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<AcademicYearSummary[]>('/academic-years'),
  ]);

  return (
    <>
      <PageHeader
        title="Classrooms"
        description="Sections per class level, within an academic year."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/school/classrooms/academic-years/new" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50">
              Add academic year
            </Link>
            <Link href="/school/classrooms/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
              <IconPlus size={17} />
              Add classroom
            </Link>
          </div>
        }
      />

      <ClassSetupTabs current="classrooms" />

      <Card className="mb-6" title="Classrooms">
        {classrooms.length === 0 ? (
          <EmptyState
            title="No classrooms yet"
            description="Create an academic year first, then add your sections."
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

      <Card title="Academic years">
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
    </>
  );
}
