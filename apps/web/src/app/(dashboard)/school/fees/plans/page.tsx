import Link from 'next/link';
import type { Metadata } from 'next';
import type { AcademicYearSummary, FeePlanView, FeeReminderPolicyView } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { formatDay } from '../calendar';
import { PlanControls, PlanForm, ReminderForm } from './forms';

export const metadata: Metadata = { title: 'Installment plans · Poetree' };

function PlanCard({
  plan,
  year,
  classLevels,
}: {
  plan: FeePlanView;
  year: AcademicYearSummary;
  classLevels: Array<{ id: string; name: string }>;
}) {
  return (
    <Card
      title={plan.name}
      description={
        plan.classLevels.length === 0
          ? 'All classes'
          : plan.classLevels.map((level) => level.name).join(', ')
      }
      action={plan.isEnabled ? <Pill tone="brand">Offered</Pill> : <Pill>Switched off</Pill>}
    >
      <div className="space-y-5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400">
              <th scope="col" className="pb-2 font-semibold">
                Installment
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Due
              </th>
              <th scope="col" className="pb-2 text-right font-semibold" data-numeric>
                Weight
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.installments.map((installment) => (
              <tr key={installment.label} className="border-t border-navy-950/[0.05]">
                <td className="py-2 font-medium text-navy-950">{installment.label}</td>
                <td className="py-2 text-slate-600">{formatDay(installment.dueDate)}</td>
                <td className="py-2 text-right text-slate-600" data-numeric>
                  {installment.weight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Children, not families: two brothers on the same plan are two. */}
        <p className="text-sm text-slate-600">
          {plan.selections === 0
            ? 'Nobody is on this plan yet.'
            : `${plan.selections} ${plan.selections === 1 ? 'child' : 'children'} on this plan.`}
        </p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            What it comes to, before concessions
          </p>
          {plan.preview.length === 0 ? (
            <p className="text-sm text-slate-500">
              No fee structure is set for{' '}
              {plan.classLevels.length === 0 ? 'any class' : 'its classes'} in{' '}
              {plan.academicYearName} yet, so there is nothing to divide.
            </p>
          ) : (
            <ul className="space-y-2">
              {plan.preview.map((row) => (
                <li
                  key={row.classLevelId}
                  className="rounded-xl px-3 py-2.5 ring-1 ring-navy-950/[0.06]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-navy-950">{row.classLevelName}</span>
                    <span className="text-sm text-slate-600">
                      {formatPrice(row.yearInPaise)} a year
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {row.installmentsInPaise
                      .map(
                        (amount, index) =>
                          `${plan.installments[index]?.label ?? index + 1} ${formatPrice(amount)}`,
                      )
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <PlanControls plan={plan} year={year} classLevels={classLevels} />
      </div>
    </Card>
  );
}

/**
 * The ways a family may spread a year's fees, and when the school reminds
 * them about each installment.
 *
 * A family chooses a plan in the app, and each of its installments becomes an
 * ordinary invoice: payments, receipts and arrears all work on it as on any
 * other. The office can move a child onto a plan, or across, from the child's
 * page.
 */
export default async function FeePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const [{ year }, years, classLevels, reminders] = await Promise.all([
    searchParams,
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
    apiFetch<FeeReminderPolicyView>('/fees/reminders'),
  ]);

  // The year asked for, else the current one. Always named to the API, so a
  // school with no current year still sees the plans of the year it picked.
  const selected = years.find((y) => y.id === year) ?? years.find((y) => y.isCurrent) ?? years[0];
  const plans = selected
    ? await apiFetch<FeePlanView[]>('/fees/plans', { query: { academicYearId: selected.id } })
    : [];
  const levels = classLevels.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/fees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            Fees
          </Link>
        }
        title="Installment plans"
        description="How families may spread a year’s fees. Each installment becomes an ordinary invoice once a family chooses the plan."
      />

      {!selected ? (
        <Notice tone="info" title="Create an academic year first">
          Plans belong to a year.
        </Notice>
      ) : (
        <>
          {years.length > 1 && (
            <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Academic year">
              {years.map((y) => (
                <Link
                  key={y.id}
                  href={`/school/fees/plans?year=${y.id}`}
                  aria-current={y.id === selected.id ? 'page' : undefined}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium ${
                    y.id === selected.id
                      ? 'bg-navy-900 text-white'
                      : 'text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50'
                  }`}
                >
                  {y.name}
                  {y.isCurrent ? ' (current)' : ''}
                </Link>
              ))}
            </nav>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-5">
              {plans.length === 0 ? (
                <Card>
                  <EmptyState
                    title={`No plans for ${selected.name} yet`}
                    description="Add one below: Annual, Half-yearly, Quarterly or Monthly, or a pattern of your own."
                  />
                </Card>
              ) : (
                plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} year={selected} classLevels={levels} />
                ))
              )}

              <Card
                title="Add a plan"
                description={`For ${selected.name}. Families in its classes can choose it in the app until their year’s fees are billed.`}
              >
                <PlanForm key={selected.id} year={selected} classLevels={levels} />
              </Card>
            </div>

            <Card
              title="Reminders"
              description="For every unpaid invoice, on a plan or not. One setting for the whole school."
            >
              <ReminderForm policy={reminders} />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
