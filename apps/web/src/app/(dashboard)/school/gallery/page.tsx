import type { Metadata } from 'next';
import Link from 'next/link';
import type { ClassroomSummary, GalleryEventSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { NewEventForm } from './forms';

export const metadata: Metadata = { title: 'Gallery · Poetree' };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The school's photographs, by the occasion they were taken at.
 *
 * Families see them in the app as Gallery → event → photos, and only the
 * events open to their child's class. That is the one decision the office
 * makes here that matters: the photos are of other people's children.
 */
export default async function GalleryPage() {
  const [events, classrooms] = await Promise.all([
    apiFetch<GalleryEventSummary[]>('/gallery/events'),
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Photos from school events. Each event is shown only to the classes you choose."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Events" description="Newest first. Families only see an event once it has photos.">
          {events.length === 0 ? (
            <EmptyState
              title="No events yet"
              description="Create one for your next occasion — a trip, a festival, sports day — and add its photos."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((event) => {
                const fileId = event.cover?.url.split('/').pop();
                return (
                  <Link
                    key={event.id}
                    href={`/school/gallery/${event.id}`}
                    className="group overflow-hidden rounded-2xl ring-1 ring-navy-950/10 transition-shadow hover:shadow-md"
                  >
                    <div className="aspect-[4/3] bg-slate-100">
                      {fileId ? (
                        <img
                          src={`/attachments?id=${fileId}`}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-xs text-slate-400">
                          No photos yet
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate font-semibold text-navy-950">{event.name}</p>
                      <p className="text-xs text-slate-500">
                        {[formatDate(event.eventDate), `${event.photoCount} photos`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {event.visibleToAll ? (
                          <Pill tone="brand">Whole school</Pill>
                        ) : (
                          event.classrooms.map((classroom) => (
                            <Pill key={classroom.id}>{classroom.label}</Pill>
                          ))
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="New event" description="Name it and choose who sees it. Photos come next.">
          <NewEventForm classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
