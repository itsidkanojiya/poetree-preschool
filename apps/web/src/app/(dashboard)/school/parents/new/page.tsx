import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { ParentForm } from '../../forms';

export const metadata: Metadata = { title: 'Add a parent · Poetree' };

export default function NewParentPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/parents"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All parents
          </Link>
        }
        title="Add a parent"
        description="A parent signs in with their phone number. Link their children to them when you add the child."
      />
      <div className="max-w-3xl">
        <Card>
          <ParentForm />
        </Card>
      </div>
    </>
  );
}
