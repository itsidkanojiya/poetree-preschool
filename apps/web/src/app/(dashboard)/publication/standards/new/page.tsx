import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewStandardForm } from '../forms';

export const metadata: Metadata = { title: 'Add a standard · Poetree Admin' };

export default function NewStandardPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/standards"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All standards
          </Link>
        }
        title="Add a standard"
        description="A year every school can open a class in. Adding one here does not open a class anywhere."
      />
      <div className="max-w-3xl">
        <Card>
          <NewStandardForm />
        </Card>
      </div>
    </>
  );
}
