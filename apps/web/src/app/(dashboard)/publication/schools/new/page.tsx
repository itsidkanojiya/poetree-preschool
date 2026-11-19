import Link from 'next/link';
import type { Metadata } from 'next';
import type { OrganisationSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { FOCUS } from '../../readiness';
import { NewSchoolForm } from './school-form';

export const metadata: Metadata = { title: 'Add a school · Poetree Admin' };

/**
 * A new school: the school itself here, then its administrator, books and
 * access on its own page.
 *
 * Opened from a group's "Add a branch", the group comes in the address and is
 * already chosen.
 */
export default async function NewSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group } = await searchParams;
  // Offered as a choice on the form. Most schools are independent, so this is
  // usually an empty list and the field does not appear at all.
  const organisations = await apiFetch<OrganisationSummary[]>('/publication/organisations');
  const chosen = organisations.find((organisation) => organisation.id === group);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={chosen ? `/publication/organisations/${chosen.id}` : '/publication/schools'}
            className={`inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            {chosen ? chosen.name : 'All schools'}
          </Link>
        }
        title={chosen ? `Add a branch to ${chosen.name}` : 'Add a school'}
        description="After this you add the administrator, choose books and set access on the school's page."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,48rem)_20rem]">
        <Card>
          <NewSchoolForm organisations={organisations} defaultOrganisationId={chosen?.id} />
        </Card>
        <aside className="space-y-5">
          <Card title="The School ID">
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Parents and teachers type it into the Poetree Kids app to sign in, so it can’t be
                changed later.
              </p>
              <p>
                Left blank, it is made from the name. A group’s branches are numbered under the
                group’s code: <span className="font-mono text-navy-950">sunrise01</span>,{' '}
                <span className="font-mono text-navy-950">sunrise02</span>.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
