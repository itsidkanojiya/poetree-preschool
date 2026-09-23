import Link from 'next/link';
import type { OrganisationSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewSchoolForm } from './school-form';

export default async function NewSchoolPage() {
  // Offered as a choice on the form. Most schools are independent, so this is
  // usually an empty list and the field does not appear at all.
  const organisations = await apiFetch<OrganisationSummary[]>('/publication/organisations');

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
          <NewSchoolForm organisations={organisations} />
        </Card>
      </div>
    </>
  );
}
