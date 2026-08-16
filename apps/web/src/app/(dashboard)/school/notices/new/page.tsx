import Link from 'next/link';
import type { Metadata } from 'next';
import type { ClassroomSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewNoticeForm } from '../forms';

export const metadata: Metadata = { title: 'Write a notice · Poetree' };

export default async function NewNoticePage() {
  const classrooms = await apiFetch<ClassroomSummary[]>('/classrooms');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/notices"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All notices
          </Link>
        }
        title="Write a notice"
        description="Goes to every family it is addressed to, on their phones."
      />
      <div className="max-w-3xl">
        <Card>
          <NewNoticeForm classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
