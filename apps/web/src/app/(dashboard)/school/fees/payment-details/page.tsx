import Link from 'next/link';
import type { Metadata } from 'next';
import type { PaymentDetailsView } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { PaymentDetailsForm } from './form';

export const metadata: Metadata = { title: 'Payment details · Poetree' };

/** Where families pay the school, shown to them in the app with each installment. */
export default async function PaymentDetailsPage() {
  const saved = await apiFetch<PaymentDetailsView>('/fees/payment-details');
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/fees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            Fees
          </Link>
        }
        title="Payment details"
        description="How parents pay you. They see only what is switched on, pay from their own bank or UPI app, and send you a screenshot to approve."
      />
      <div className="max-w-3xl">
        <Card>
          <PaymentDetailsForm saved={saved} />
        </Card>
      </div>
    </>
  );
}
