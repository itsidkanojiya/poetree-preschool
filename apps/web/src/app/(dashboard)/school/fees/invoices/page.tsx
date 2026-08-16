import Link from 'next/link';
import type { Metadata } from 'next';
import type { AcademicYearSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { GenerateInvoicesForm } from '../forms';

export const metadata: Metadata = { title: 'Generate invoices · Poetree' };

export default async function GenerateInvoicesPage() {
  const years = await apiFetch<AcademicYearSummary[]>('/academic-years');

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
        title="Generate invoices"
        description="Raises the bill for one period, for every child it applies to."
      />
      <div className="max-w-3xl">
        <Card>
          <GenerateInvoicesForm years={years} />
        </Card>
      </div>
    </>
  );
}
