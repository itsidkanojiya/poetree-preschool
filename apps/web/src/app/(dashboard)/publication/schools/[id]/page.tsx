import Link from 'next/link';
import type { Paginated, PlanSummary, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader, StatTile, StatusBadge } from '@/components/ui/layout';
import { formatDate } from '@/lib/format';
import {
  AssignPlanPanel,
  CreateAdminPanel,
  ReactivatePanel,
  SchoolDetailsForm,
  SuspendPanel,
} from './panels';

interface SuspensionImpact {
  schoolId: string;
  schoolName: string;
  users: number;
  activeSessions: number;
}

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [school, plans, impact] = await Promise.all([
    apiFetch<SchoolSummary>(`/publication/schools/${id}`),
    apiFetch<Paginated<PlanSummary>>('/publication/plans', { query: { pageSize: 100 } }),
    apiFetch<SuspensionImpact>(`/publication/schools/${id}/suspension-impact`),
  ]);

  const blocked = school.status === 'SUSPENDED' || school.status === 'EXPIRED';

  return (
    <>
      <PageHeader
        title={school.name}
        description={`Code ${school.code} · created ${formatDate(school.createdAt)}`}
        action={
          <Link href="/publication/schools" className="text-sm text-slate-600 hover:underline">
            ← All schools
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Status</p>
          <p className="mt-2">
            <StatusBadge status={school.status} />
          </p>
        </div>
        <StatTile label="Plan" value={school.planName ?? '—'} hint={`Expires ${formatDate(school.expiresAt)}`} />
        <StatTile label="Users" value={school.counts.users} />
        <StatTile label="Students" value={school.counts.students} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={blocked ? 'Restore access' : 'Access control'}
          description={
            blocked
              ? 'This school is currently blocked. Nobody there can sign in.'
              : 'Switching the plan off blocks every user of this school immediately.'
          }
        >
          {blocked ? <ReactivatePanel school={school} /> : <SuspendPanel school={school} impact={impact} />}
        </Card>

        <Card
          title="Subscription plan"
          description="Assigning a plan also sets the school to active."
        >
          <AssignPlanPanel school={school} plans={plans.items} />
        </Card>

        <Card
          title="School administrator"
          description="Creates a SCHOOL_ADMIN who can manage this school’s teachers, parents and students."
        >
          <CreateAdminPanel schoolId={school.id} />
        </Card>

        <Card title="School details">
          <SchoolDetailsForm school={school} />
        </Card>
      </div>
    </>
  );
}
