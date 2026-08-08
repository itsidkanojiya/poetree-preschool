import type { Paginated, PlanSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { formatPrice } from '@/lib/format';
import { NewPlanForm } from './plan-form';

export default async function PlansPage() {
  const plans = await apiFetch<Paginated<PlanSummary>>('/publication/plans', {
    query: { pageSize: 100 },
  });

  return (
    <>
      <PageHeader
        title="Subscription plans"
        description="Seat limits here are enforced when a school adds teachers or students."
      />

      <Card className="mb-6">
        {plans.items.length === 0 ? (
          <EmptyState title="No plans yet" description="Create the first plan below." />
        ) : (
          <Table>
            <THead columns={['Plan', 'Code', 'Students', 'Teachers', 'Price', 'Schools', 'Active']} />
            <tbody>
              {plans.items.map((plan) => (
                <TRow key={plan.id}>
                  <TCell className="font-medium text-slate-900">
                    {plan.name}
                    {plan.description && (
                      <span className="block text-xs text-slate-500">{plan.description}</span>
                    )}
                  </TCell>
                  <TCell className="font-mono text-xs">{plan.code}</TCell>
                  <TCell>{plan.maxStudents ?? 'Unlimited'}</TCell>
                  <TCell>{plan.maxTeachers ?? 'Unlimited'}</TCell>
                  <TCell>{formatPrice(plan.priceInPaise)}</TCell>
                  <TCell>{plan.schoolCount}</TCell>
                  <TCell>{plan.isActive ? 'Yes' : 'No'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Add a plan">
        <NewPlanForm />
      </Card>
    </>
  );
}
