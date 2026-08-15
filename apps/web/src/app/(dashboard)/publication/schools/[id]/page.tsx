import Link from 'next/link';
import type { Paginated, PlanSummary, SchoolSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, Meter, PageHeader, Pill, StatTile, StatusBadge } from '@/components/ui/layout';
import { IconArrowLeft, IconStudent, IconTeacher } from '@/components/icons';
import { daysUntil, formatDate } from '@/lib/format';
import type { SchoolBookRow } from '@poetree/shared';
import { SchoolBooksPanel } from '../../books/forms';
import {
  AssignPlanPanel,
  CreateAdminPanel,
  LogoPanel,
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

  const [school, plans, impact, schoolBooks] = await Promise.all([
    apiFetch<SchoolSummary>(`/publication/schools/${id}`),
    apiFetch<Paginated<PlanSummary>>('/publication/plans', { query: { pageSize: 100 } }),
    apiFetch<SuspensionImpact>(`/publication/schools/${id}/suspension-impact`),
    apiFetch<SchoolBookRow[]>(`/publication/schools/${id}/books`),
  ]);

  const blocked = school.status === 'SUSPENDED' || school.status === 'EXPIRED';
  const remaining = daysUntil(school.expiresAt);

  // Seat limits come from the plan currently assigned to this school.
  const currentPlan = plans.items.find((plan) => plan.name === school.planName) ?? null;

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
        title={school.name}
        description={`Created ${formatDate(school.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Pill tone="neutral">{school.code}</Pill>
            <StatusBadge status={school.status} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Plan"
          value={school.planName ?? 'None'}
          tone={blocked ? 'critical' : 'default'}
          hint={
            school.expiresAt
              ? remaining !== null && remaining > 0
                ? `Expires ${formatDate(school.expiresAt)} · ${remaining} days left`
                : `Expired ${formatDate(school.expiresAt)}`
              : 'No plan assigned yet'
          }
        />
        <StatTile label="Users" value={school.counts.users} hint="Admins, teachers and parents" />
        <StatTile
          label="Students"
          value={school.counts.students}
          icon={<IconStudent size={17} />}
        />
        <StatTile
          label="Teachers"
          value={school.counts.teachers}
          icon={<IconTeacher size={17} />}
        />
      </div>

      {currentPlan && (
        <div className="mt-4">
          <Card title="Plan usage" description={`Seat limits from the ${currentPlan.name} plan.`}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Meter
                label="Students"
                used={school.counts.students}
                limit={currentPlan.maxStudents}
              />
              <Meter
                label="Teachers"
                used={school.counts.teachers}
                limit={currentPlan.maxTeachers}
              />
            </div>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card
          tone={blocked ? 'default' : 'danger'}
          title={blocked ? 'Restore access' : 'Access control'}
          description={
            blocked
              ? 'This school is blocked. Nobody there can sign in.'
              : 'Switching the plan off blocks every user of this school immediately.'
          }
        >
          {blocked ? (
            <ReactivatePanel school={school} />
          ) : (
            <SuspendPanel school={school} impact={impact} />
          )}
        </Card>

        <Card
          title="Subscription plan"
          description="Assigning a plan also sets the school to active."
        >
          <AssignPlanPanel school={school} plans={plans.items} />
        </Card>

        <Card
          title="School administrator"
          description="Creates a School Admin who can manage this school's teachers, parents and students."
        >
          <CreateAdminPanel schoolId={school.id} />
        </Card>

        <Card
          title="Books"
          description="What this school bought. Only these appear in their app."
        >
          <SchoolBooksPanel schoolId={school.id} rows={schoolBooks} />
        </Card>

        <Card
          title="Logo"
          description="Shown on their app's sign-in screen and beside their name everywhere."
        >
          <LogoPanel school={school} />
        </Card>

        <Card title="School details">
          <SchoolDetailsForm school={school} />
        </Card>
      </div>
    </>
  );
}
