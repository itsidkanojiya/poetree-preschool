import type { FeePlanChoice } from '@poetree/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card } from '@/components/ui/layout';
import { formatMoment } from '../../fees/calendar';
import { FeePlanMover } from './fee-plan-form';

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-navy-950" data-numeric>
        {value}
      </dd>
    </div>
  );
}

/**
 * How this child's fees for the current year are spread, and a way for the
 * office to change it.
 *
 * Fetches its own data so the rest of the page does not wait on fees, and so
 * a school with no current year, or no fees set, still gets the child's page.
 */
export async function FeePlanCard({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  let choice: FeePlanChoice | null = null;
  let problem: string | null = null;
  try {
    choice = await apiFetch<FeePlanChoice>(`/fees/students/${studentId}/plan`);
  } catch (error) {
    // A redirect to sign in, or anything unexpected, goes on up.
    if (!(error instanceof ApiRequestError)) throw error;
    problem = error.message;
  }

  if (!choice) {
    return (
      <Card title="Installment plan">
        <p className="text-sm text-slate-500">{problem}</p>
      </Card>
    );
  }

  // The API's reasons are written for the family in the app, so the office's
  // own account of the same situation is given here where it differs.
  let status: string | null;
  if (choice.current) {
    status = `${choice.current.byFamily ? 'Chosen by the family' : 'Set by the school'} on ${formatMoment(
      choice.current.chosenAt,
    )}.`;
  } else if (choice.options.length === 0) {
    status = choice.reason;
  } else if (choice.canChoose) {
    status = 'The family can choose one in the app, or you can put the child on one here.';
  } else {
    status =
      'This year’s fees are already billed, so the family cannot choose in the app. Put the child on a plan here.';
  }

  return (
    <Card title="Installment plan" description={`For ${choice.academicYearName}.`}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-navy-950">
            {choice.current ? (
              <>
                On the <span className="font-semibold">{choice.current.planName}</span> plan
              </>
            ) : (
              'No plan chosen yet'
            )}
          </p>
          {status && <p className="mt-0.5 text-xs text-slate-500">{status}</p>}
        </div>

        <dl className="grid grid-cols-3 gap-4">
          <Figure label="Year’s fees" value={formatPrice(choice.yearInPaise)} />
          <Figure label="Paid" value={formatPrice(choice.paidInPaise)} />
          <Figure label="Remaining" value={formatPrice(choice.remainingInPaise)} />
        </dl>

        <FeePlanMover studentId={studentId} studentName={studentName} choice={choice} />
      </div>
    </Card>
  );
}
