import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader, StatTile, Card } from '@/components/ui/layout';

interface Overview {
  schools: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    expiringSoon: number;
  };
  students: number;
  teachers: number;
}

export default async function PublicationOverviewPage() {
  const overview = await apiFetch<Overview>('/publication/overview');

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every school on the Poetree platform, at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Schools" value={overview.schools.total} />
        <StatTile
          label="Active"
          value={overview.schools.active + overview.schools.trial}
          hint={`${overview.schools.trial} on trial`}
        />
        <StatTile
          label="Blocked"
          value={overview.schools.suspended + overview.schools.expired}
          hint={`${overview.schools.suspended} suspended · ${overview.schools.expired} expired`}
        />
        <StatTile
          label="Expiring in 30 days"
          value={overview.schools.expiringSoon}
          hint="Renew before access is cut"
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatTile label="Students across all schools" value={overview.students} />
        <StatTile label="Teachers across all schools" value={overview.teachers} />
      </div>

      <Card className="mt-6" title="Next steps">
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <Link className="text-brand-700 hover:underline" href="/publication/schools/new">
              Onboard a new school
            </Link>{' '}
            — creates the school, then its administrator.
          </li>
          <li>
            <Link className="text-brand-700 hover:underline" href="/publication/plans">
              Manage subscription plans
            </Link>{' '}
            — seat limits and pricing.
          </li>
          <li>
            <Link className="text-brand-700 hover:underline" href="/publication/schools">
              Review schools
            </Link>{' '}
            — assign plans, suspend, or reactivate access.
          </li>
        </ul>
      </Card>
    </>
  );
}
