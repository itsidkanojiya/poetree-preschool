import type { HomeworkSummary, Paginated, SubmissionSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { formatDate } from '@/lib/format';
import { NewHomeworkForm, SubmissionList } from './forms';

interface MyClassroom {
  id: string;
  label: string;
}

export default async function TeacherHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;

  const [classrooms, homework] = await Promise.all([
    apiFetch<MyClassroom[]>('/me/classrooms'),
    apiFetch<Paginated<HomeworkSummary>>('/homework', { query: { pageSize: 25 } }),
  ]);

  // Only fetch the submission list for the item actually expanded — thirty
  // children per class adds up quickly across a term of homework.
  const openId = open ?? homework.items[0]?.id ?? null;
  const submissions = openId
    ? await apiFetch<SubmissionSummary[]>(`/homework/${openId}/submissions`)
    : [];

  return (
    <>
      <PageHeader title="Homework" description="Set work and mark who has done it." />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card title="Set homework">
          <NewHomeworkForm classrooms={classrooms} />
        </Card>

        <Card
          title="Recent"
          description={homework.total > 0 ? 'Select one to mark who has done it.' : undefined}
        >
          {homework.items.length === 0 ? (
            <EmptyState title="No homework yet" description="Set the first one on the left." />
          ) : (
            <ul className="space-y-1.5">
              {homework.items.map((item) => {
                const active = item.id === openId;
                return (
                  <li key={item.id}>
                    <a
                      href={`/teacher/homework?open=${item.id}`}
                      className={`block rounded-xl px-3 py-2.5 transition-colors ${
                        active ? 'bg-navy-50 ring-1 ring-navy-200' : 'hover:bg-navy-50'
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-navy-950">{item.title}</span>
                        {item.status === 'DRAFT' && <Pill tone="neutral">Draft</Pill>}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.classroom.label} · due {formatDate(item.dueDate)}
                        {item.progress.total > 0 &&
                          ` · ${item.progress.completed} of ${item.progress.total} done`}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {openId && (
        <div className="mt-5">
          <Card
            title="Who has done it"
            description="One tap per child. Nothing else to open."
          >
            <SubmissionList submissions={submissions} />
          </Card>
        </div>
      )}
    </>
  );
}
