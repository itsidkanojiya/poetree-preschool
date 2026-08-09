import type { Paginated, PlanSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table } from '@/components/ui/table';
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
        description="Seat limits set here are enforced when a school adds teachers or students."
      />

      <Card className="mb-6">
        {plans.items.length === 0 ? (
          <EmptyState title="No plans yet" description="Create the first plan below." />
        ) : (
          <Table>
            <THead
              columns={[
                'Plan',
                'Code',
                { label: 'Students', numeric: true },
                { label: 'Teachers', numeric: true },
                { label: 'Price', numeric: true },
                { label: 'Schools', numeric: true },
                'State',
              ]}
            />
            <tbody>
              {plans.items.map((plan) => (
                <TRow key={plan.id}>
                  <TCell>
                    <TPrimary sub={plan.description ?? undefined}>{plan.name}</TPrimary>
                  </TCell>
                  <TCell>
                    <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {plan.code}
                    </code>
                  </TCell>
                  <TCell numeric>{plan.maxStudents ?? '∞'}</TCell>
                  <TCell numeric>{plan.maxTeachers ?? '∞'}</TCell>
                  <TCell numeric>{formatPrice(plan.priceInPaise)}</TCell>
                  <TCell numeric>{plan.schoolCount}</TCell>
                  <TCell>
                    <Pill tone={plan.isActive ? 'brand' : 'neutral'}>
                      {plan.isActive ? 'Active' : 'Retired'}
                    </Pill>
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="max-w-3xl">
        <Card title="Add a plan" description="Codes are permanent once created.">
          <NewPlanForm />
        </Card>
      </div>
    </>
  );
}
