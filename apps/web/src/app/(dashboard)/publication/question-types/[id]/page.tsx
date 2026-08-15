import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { EditActivityForm, RetireButton } from '../forms';

export const metadata: Metadata = { title: 'Activity · Poetree Admin' };

interface Skill {
  id: string;
  code: string;
  name: string;
}

interface ClassLevel {
  id: string;
  code: string;
  name: string;
}

interface BookOption {
  id: string;
  name: string;
  classLevel: { name: string };
}

interface ChapterOption {
  id: string;
  name: string;
  bookId: string;
  bookName: string;
}

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [activity, skills, classLevels, books, chapters] = await Promise.all([
    apiFetch<CatalogueActivity & { content: unknown }>(`/publication/activities/${id}`),
    apiFetch<Skill[]>('/publication/skills'),
    apiFetch<ClassLevel[]>('/publication/class-levels'),
    apiFetch<BookOption[]>('/publication/books'),
    apiFetch<ChapterOption[]>('/publication/chapters'),
  ]);

  return (
    <>
      <Link
        href="/publication/question-types"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900"
      >
        <IconArrowLeft size={16} /> All activities
      </Link>

      <PageHeader
        title={activity.title}
        description={`${activity.code} · played ${activity.attemptCount} ${
          activity.attemptCount === 1 ? 'time' : 'times'
        } across every school`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {activity.isActive ? <Pill tone="brand">Live</Pill> : <Pill tone="neutral">Retired</Pill>}
        {!activity.isPlayable && <Pill tone="neutral">The app cannot read this content</Pill>}
        <span className="text-xs text-slate-500">Last changed {formatDate(activity.updatedAt)}</span>
        <RetireButton activity={activity} />
        <Link
          href={`/publication/question-types/${activity.id}/questions`}
          className="rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-navy-800"
        >
          {activity.itemCount === 0
            ? 'Add questions'
            : `Edit ${activity.itemCount} ${activity.itemCount === 1 ? 'question' : 'questions'}`}
        </Link>
      </div>

      <div className="max-w-3xl">
        <Card title="Edit">
          <EditActivityForm
            activity={activity}
            content={JSON.stringify(activity.content ?? {}, null, 2)}
            skills={skills}
            classLevels={classLevels}
            books={books}
            chapters={chapters}
          />
        </Card>
      </div>
    </>
  );
}
