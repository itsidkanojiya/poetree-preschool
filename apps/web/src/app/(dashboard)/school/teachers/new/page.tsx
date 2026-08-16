import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { TeacherForm } from '../../forms';

export const metadata: Metadata = { title: 'Add a teacher · Poetree' };

export default function NewTeacherPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/teachers"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All teachers
          </Link>
        }
        title="Add a teacher"
        description="They can sign in as soon as this is saved. Assign them a class on the Classrooms screen."
      />
      <div className="max-w-3xl">
        <Card>
          <TeacherForm />
        </Card>
      </div>
    </>
  );
}
