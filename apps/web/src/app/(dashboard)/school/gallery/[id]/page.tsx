import type { Metadata } from 'next';
import Link from 'next/link';
import type { ClassroomSummary, GalleryEventDetail } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { DeleteEventButton, EditEventForm, PhotoGrid, PhotoUploader } from '../forms';

export const metadata: Metadata = { title: 'Event · Gallery · Poetree' };

export default async function GalleryEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, classrooms] = await Promise.all([
    apiFetch<GalleryEventDetail>(`/gallery/events/${id}`),
    apiFetch<ClassroomSummary[]>('/classrooms'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/gallery"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All events
          </Link>
        }
        title={event.name}
        description={
          event.visibleToAll
            ? `${event.photoCount} photos · every family in the school`
            : `${event.photoCount} photos · ${event.classrooms.map((c) => c.label).join(', ')}`
        }
        action={<DeleteEventButton event={event} />}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card title="Add photos">
            <PhotoUploader eventId={event.id} />
          </Card>
          <Card title="Photos">
            <PhotoGrid event={event} />
          </Card>
        </div>

        <Card title="Event" description="The name, the date, and who can see it.">
          <EditEventForm event={event} classrooms={classrooms} />
        </Card>
      </div>
    </>
  );
}
