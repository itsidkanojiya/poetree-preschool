import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewSchoolForm } from './school-form';

export default function NewSchoolPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/schools"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All schools
          </Link>
        }
        title="Add a school"
        description="Create the school first — its plan and administrator are set up on the next screen."
      />
      <div className="max-w-3xl">
        <Card>
          <NewSchoolForm />
        </Card>
      </div>
    </>
  );
}
