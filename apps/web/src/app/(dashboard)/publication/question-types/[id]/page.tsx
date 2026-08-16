import Link from 'next/link';
import type { Metadata } from 'next';
import type { CatalogueActivity } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { ActivityLiveSwitch, EditActivityForm } from '../forms';

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
      <PageHeader
        eyebrow={
          <Link
            href="/publication/question-types"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All question types
          </Link>
        }
        title={activity.title}
        description={`${activity.code} · played ${activity.attemptCount} ${
          activity.attemptCount === 1 ? 'time' : 'times'
        } across every school`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {!activity.isPlayable && <Pill tone="neutral">The app cannot read this content</Pill>}
        <span className="text-xs text-slate-500">Last changed {formatDate(activity.updatedAt)}</span>
      </div>

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card title="The question type">
          <EditActivityForm
            activity={activity}
            content={JSON.stringify(activity.content ?? {}, null, 2)}
            skills={skills}
            classLevels={classLevels}
            books={books}
            chapters={chapters}
          />
        </Card>

        <div className="space-y-4">
          <Card
            title="Questions"
            description="What a child actually answers. A page with none of these reaches nobody."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {activity.itemCount === 0
                  ? 'Nothing written yet.'
                  : `${activity.itemCount} ${activity.itemCount === 1 ? 'question' : 'questions'}.`}
              </p>
              <Link
                href={`/publication/question-types/${activity.id}/questions`}
                className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800"
              >
                {activity.itemCount === 0 ? 'Write the questions' : 'Edit the questions'}
              </Link>
            </div>
          </Card>

          <Card title="In the book">
            <ActivityLiveSwitch activity={activity} />
          </Card>
        </div>
      </div>
    </>
  );
}
