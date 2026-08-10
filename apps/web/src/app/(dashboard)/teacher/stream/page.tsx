import type { ClassroomPostSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { NewPostForm } from './forms';

interface MyClassroom {
  id: string;
  label: string;
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default async function ClassStreamPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const { classroomId } = await searchParams;

  const classrooms = await apiFetch<MyClassroom[]>('/me/classrooms');
  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0];

  const posts = selected
    ? await apiFetch<ClassroomPostSummary[]>('/classroom-posts', {
        query: { classroomId: selected.id },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Class stream"
        description="Announcements and materials for parents of your class."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Card title="Post to the class">
          <NewPostForm classrooms={classrooms} selectedId={selected?.id} />
        </Card>

        <Card
          title={selected ? selected.label : 'Stream'}
          description="Newest first. Deliberately no comments — this is not a message board."
          action={
            // A plain GET form: this is a server component, so it cannot carry
            // an onChange handler. The button does the work instead.
            classrooms.length > 1 ? (
              <form action="/teacher/stream" className="flex gap-2">
                <select
                  name="classroomId"
                  defaultValue={selected?.id}
                  className="rounded-lg border-0 bg-white py-1.5 pl-2.5 pr-8 text-sm ring-1 ring-inset ring-navy-950/15"
                >
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
                >
                  Show
                </button>
              </form>
            ) : undefined
          }
        >
          {posts.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              description="Share what the class is doing, or a note for parents."
            />
          ) : (
            <ul className="space-y-2.5">
              {posts.map((post) => (
                <li key={post.id} className="rounded-xl px-3 py-3 ring-1 ring-navy-950/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-navy-950">{post.title}</span>
                    {post.type === 'MATERIAL' && <Pill tone="brand">Material</Pill>}
                  </div>
                  {post.body && <p className="mt-1 text-xs text-slate-600">{post.body}</p>}
                  <p className="mt-1.5 text-xs text-slate-500">
                    {post.createdBy} · {timeAgo(post.publishedAt)}
                    {post.attachmentCount > 0 && ` · ${post.attachmentCount} attachment(s)`}
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
