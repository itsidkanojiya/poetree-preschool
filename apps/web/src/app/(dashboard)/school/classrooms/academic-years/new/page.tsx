import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AcademicYearForm } from '../../../forms';

export const metadata: Metadata = { title: 'Add an academic year · Poetree' };

export default function NewAcademicYearPage() {
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
        title="Add an academic year"
        description="The year classrooms sit in, and the year attendance and fees are filed against."
      />
      <div className="max-w-3xl">
        <Card>
          <AcademicYearForm />
        </Card>
      </div>
    </>
  );
}
