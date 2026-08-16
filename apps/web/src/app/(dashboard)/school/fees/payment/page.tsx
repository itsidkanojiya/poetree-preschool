import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { RecordPaymentForm } from '../forms';
import { allStudents } from '../students';

export const metadata: Metadata = { title: 'Record a payment · Poetree' };

export default async function RecordPaymentPage() {
  const students = await allStudents();

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
        title="Record a payment"
        description="Issues a numbered receipt and settles the oldest invoice first."
      />
      <div className="max-w-3xl">
        <Card>
          <RecordPaymentForm students={students} />
        </Card>
      </div>
    </>
  );
}
