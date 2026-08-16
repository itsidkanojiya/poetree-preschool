import Link from 'next/link';
import type { Metadata } from 'next';
import type { StandardSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { StandardDetailsForm, StandardLiveSwitch } from '../forms';

export const metadata: Metadata = { title: 'Standard · Poetree Admin' };

/**
 * One year of school.
 *
 * There is no endpoint for a single standard — there are four or five of them
 * in total, so the list is the cheaper read and this picks its row out of it.
 */
export default async function StandardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const standards = await apiFetch<StandardSummary[]>('/publication/standards', {
    query: { includeInactive: 'true' },
  });
  const standard = standards.find((row) => row.id === id);

  if (!standard) {
    return <EmptyState title="Standard not found" description="It may have been removed." />;
  }

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
        title={standard.name}
        description={`${standard.code} · ${standard.classroomCount} ${
          standard.classroomCount === 1 ? 'class' : 'classes'
        } across every school`}
      />

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card title="The standard">
          <StandardDetailsForm standard={standard} />
        </Card>

        <div className="space-y-4">
          <Card title="Offered to schools">
            <StandardLiveSwitch standard={standard} />
          </Card>

          {standard.classroomCount > 0 && (
            <Card title="In use">
              <p className="text-sm text-slate-600">
                {standard.classroomCount} {standard.classroomCount === 1 ? 'class is' : 'classes are'}{' '}
                in this standard right now, across every school.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                That is why it cannot be deleted. Children&apos;s attendance, fees and progress are
                all filed against the class they sit in.
              </p>
            </Card>
          )}

          {!standard.isActive && (
            <Card>
              <Pill tone="neutral">Not offered</Pill>
              <p className="mt-2 text-xs text-slate-500">
                A school cannot open a new class in this year. Classes already in it carry on.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
