import type { NoticeSummary, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { formatDate } from '@/lib/format';
import Link from 'next/link';
import { IconPlus } from '@/components/icons';

const TYPE_TONE: Record<string, 'neutral' | 'brand' | 'gold'> = {
  GENERAL: 'neutral',
  ACADEMIC: 'brand',
  EVENT: 'brand',
  HOLIDAY: 'gold',
  EMERGENCY: 'gold',
};

export default async function NoticesPage() {
  const notices = await apiFetch<Paginated<NoticeSummary>>('/notices', {
    query: { pageSize: 30 },
  });

  return (
    <>
      <PageHeader
        title="Notices"
        description="Announcements to parents, teachers, or specific classes."
        action={
          <Link href="/school/notices/new" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800">
            <IconPlus size={17} />
            Write a notice
          </Link>
        }
      />

      <div>
        <Card
          title="Published"
          description="Read counts show how many recipients have opened each one."
        >
          {notices.items.length === 0 ? (
            <EmptyState title="No notices yet" description="Nothing has been sent to families yet." />
          ) : (
            <ul className="space-y-2.5">
              {notices.items.map((notice) => (
                <li
                  key={notice.id}
                  className="rounded-xl px-3 py-3 ring-1 ring-navy-950/[0.06] transition-colors hover:bg-navy-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {notice.pinned && <span className="text-gold-600">★</span>}
                    <span className="text-sm font-medium text-navy-950">{notice.title}</span>
                    <Pill tone={TYPE_TONE[notice.type] ?? 'neutral'}>
                      {notice.type.charAt(0) + notice.type.slice(1).toLowerCase()}
                    </Pill>
                    {notice.status === 'DRAFT' && <Pill tone="neutral">Draft</Pill>}
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{notice.body}</p>

                  <p className="mt-1.5 text-xs text-slate-500">
                    {notice.audience === 'CLASSROOMS'
                      ? notice.classroomLabels.join(', ') || 'Selected classes'
                      : notice.audience === 'ALL'
                        ? 'Everyone'
                        : notice.audience.charAt(0) + notice.audience.slice(1).toLowerCase()}
                    {' · '}
                    {formatDate(notice.publishAt)}
                    {notice.expiresAt && ` · until ${formatDate(notice.expiresAt)}`}
                    {typeof notice.readCount === 'number' && ` · read by ${notice.readCount}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
