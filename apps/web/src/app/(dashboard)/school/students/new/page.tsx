import Link from 'next/link';
import type { Metadata } from 'next';
import type { ClassroomSummary, Paginated, ParentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { StudentForm } from '../../forms';

export const metadata: Metadata = { title: 'Add a student · Poetree' };

export default async function NewStudentPage() {
  const [parents, classrooms] = await Promise.all([
    apiFetch<Paginated<ParentSummary>>('/parents', { query: { pageSize: 100 } }),
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/students"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All students
          </Link>
        }
        title="Add a student"
        description="A child holds no sign-in of their own — everything about them reaches the family through the parent linked here."
      />
      <div className="max-w-3xl">
        <Card>
          <StudentForm parents={parents.items} classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
