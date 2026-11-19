import Link from 'next/link';
import type { Metadata } from 'next';
import { ACTIVITY_TYPE_LABELS, type ActivityType, type CatalogueActivity } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, Notice, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { Check, FOCUS, Readiness } from '../../readiness';
import { formatDate } from '@/lib/format';
import { ActivityLiveSwitch, EditActivityForm } from '../forms';
import { DeleteButton } from '@/components/ui/delete-button';
import { deleteActivityAction } from '../../delete-actions';

export const metadata: Metadata = { title: 'Activity type · Poetree Admin' };

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

  const editHref = `/publication/question-types/${activity.id}/questions`;
  const playedAs =
    ACTIVITY_TYPE_LABELS[activity.type as ActivityType]?.label ?? activity.type.toLowerCase();
  const state = !activity.isPlayable
    ? { pill: <Pill tone="gold">No activities</Pill>, words: 'Not yet — nothing to play' }
    : activity.isActive
      ? { pill: <Pill tone="brand">Live</Pill>, words: 'Live' }
      : { pill: <Pill tone="neutral">Off</Pill>, words: 'Switched off' };

  return (
    <>
      {/* Header: what it is and whether children get it, then the main job —
          writing its activities — as the one button. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/publication/question-types"
            className={`mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-navy-900 ${FOCUS}`}
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            All activity types
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-navy-950 [overflow-wrap:anywhere]">
              {activity.title}
            </h1>
            {state.pill}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Played as {playedAs}
            {activity.book ? (
              <>
                {' '}
                · {activity.book.name}
                {activity.chapter && <> › {activity.chapter.name}</>}
              </>
            ) : (
              <span className="text-gold-700"> · in no book, so it reaches nobody</span>
            )}
          </p>
        </div>
        <Link
          href={editHref}
          className={`inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 ${FOCUS}`}
        >
          {activity.itemCount === 0 ? 'Write the activities' : 'Edit the activities'}
        </Link>
      </div>

      <Readiness label="Set-up" columns={4}>
        <Check
          label="Activities"
          value={
            activity.itemCount === 0
              ? 'None yet'
              : `${activity.itemCount} ${activity.itemCount === 1 ? 'activity' : 'activities'}`
          }
          state={activity.itemCount === 0 ? 'todo' : 'done'}
          href={editHref}
        />
        <Check
          label="In the app"
          value={state.words}
          state={activity.isPlayable && activity.isActive ? 'done' : 'todo'}
        />
        <Check
          label="Played"
          value={`${activity.attemptCount.toLocaleString('en-IN')} ${activity.attemptCount === 1 ? 'time' : 'times'}`}
          state="info"
        />
        <Check label="Last changed" value={formatDate(activity.updatedAt)} state="info" />
      </Readiness>

      {!activity.isPlayable && activity.itemCount > 0 && (
        <div className="mb-5">
          <Notice tone="warning" title="The app cannot read this content">
            Its activities are there but none can be played. Open them to see what is missing.
          </Notice>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="The activity type">
          <EditActivityForm
            activity={activity}
            content={JSON.stringify(activity.content ?? {}, null, 2)}
            skills={skills}
            classLevels={classLevels}
            books={books}
            chapters={chapters}
          />
        </Card>

        <aside className="space-y-5">
          <Card title="Availability">
            <ActivityLiveSwitch activity={activity} />
          </Card>

          <Card
            title="Activities"
            description="What a child actually answers. A page with none of these reaches nobody."
          >
            <p className="text-sm text-slate-600">
              {activity.itemCount === 0
                ? 'Nothing written yet.'
                : `${activity.itemCount} ${activity.itemCount === 1 ? 'activity' : 'activities'}.`}{' '}
              <Link
                href={editHref}
                className={`rounded-sm font-medium text-navy-700 hover:underline ${FOCUS}`}
              >
                {activity.itemCount === 0 ? 'Write them' : 'Open them'}
              </Link>
            </p>
          </Card>

          {/* The one thing on the page that cannot be undone, last. */}
          <Card tone="danger" title="Delete this activity type">
            <p className="mb-3 text-sm text-slate-600">
              Erases it and its activities, and every child’s results on them. To keep it but stop
              children seeing it, switch it off above.
            </p>
            <DeleteButton
              action={deleteActivityAction.bind(null, activity.id)}
              label="Delete permanently"
              title={`Delete “${activity.title}” permanently?`}
              body={
                <>
                  <p>The activity type is erased with all its activities.</p>
                  <p>
                    It was played {activity.attemptCount}{' '}
                    {activity.attemptCount === 1 ? 'time' : 'times'}: those results are erased at
                    every school, and children’s skill scores are worked out again from what is
                    left.
                  </p>
                </>
              }
              confirmText={activity.title}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-300 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
