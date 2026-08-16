import Link from 'next/link';
import type { Metadata } from 'next';
import type { StandardSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewBookForm } from '../forms';

export const metadata: Metadata = { title: 'Add a book · Poetree Admin' };

export default async function NewBookPage() {
  const standards = await apiFetch<StandardSummary[]>('/publication/standards');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/books"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All books
          </Link>
        }
        title="Add a book"
        description="The cover and the film are added on the book's own page, once it exists."
      />
      <div className="max-w-3xl">
        <Card>
          <NewBookForm standards={standards} />
        </Card>
      </div>
    </>
  );
}
