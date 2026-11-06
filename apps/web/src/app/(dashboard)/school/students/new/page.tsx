import Link from 'next/link';
import type { Metadata } from 'next';
import type { ClassroomSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AddStudentForm } from './add-student-form';

export const metadata: Metadata = { title: 'Add a student · Poetree' };

export default async function NewStudentPage() {
  const classrooms = await apiFetch<ClassroomSummary[]>('/classrooms');

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
        description="The child and their parent together. Everything about the child then reaches the family through that parent’s app."
      />
      <div className="max-w-3xl">
        <Card>
          <AddStudentForm classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
