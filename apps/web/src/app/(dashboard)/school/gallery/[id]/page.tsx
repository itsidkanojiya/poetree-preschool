import type { Metadata } from 'next';
import Link from 'next/link';
import type { ClassroomSummary, GalleryDriveStatus, GalleryEventDetail } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import {
  DeleteEventButton,
  EditEventForm,
  PhotoGrid,
  PhotoUploader,
  VideoForm,
  VideoGrid,
} from '../forms';

export const metadata: Metadata = { title: 'Event · Gallery · Poetree' };

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Why photos cannot go up yet, when the school's Drive is the place for them. */
function uploadBlock(drive: GalleryDriveStatus): string | null {
  if (!drive.available) return null;
  if (!drive.connected) return 'Photos are kept in your school’s Google Drive. Connect it first.';
  if (drive.broken) return 'Google Drive access was removed. Connect it again first.';
  return null;
}

export default async function GalleryEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, classrooms, drive] = await Promise.all([
    apiFetch<GalleryEventDetail>(`/gallery/events/${id}`),
    apiFetch<ClassroomSummary[]>('/classrooms'),
    apiFetch<GalleryDriveStatus>('/gallery/drive'),
  ]);

  const contents = [
    counted(event.photoCount, 'photo', 'photos'),
    ...(event.videoCount > 0 ? [counted(event.videoCount, 'video', 'videos')] : []),
  ].join(' · ');

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
            ? `${contents} · every family in the school`
            : `${contents} · ${event.classrooms.map((c) => c.label).join(', ')}`
        }
        action={<DeleteEventButton event={event} />}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card
            title="Add photos"
            description={
              drive.available && drive.connected && !drive.broken
                ? `Kept in ${drive.email ?? 'the school'}’s Google Drive.`
                : undefined
            }
          >
            <PhotoUploader eventId={event.id} blocked={uploadBlock(drive)} />
          </Card>
          <Card title="Photos">
            <PhotoGrid event={event} />
          </Card>
          <Card title="Videos" description="From the school’s YouTube channel, by link.">
            <VideoGrid event={event} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Add a video">
            <VideoForm eventId={event.id} />
          </Card>
          <Card title="Event" description="The name, the date, and who can see it.">
            <EditEventForm event={event} classrooms={classrooms} />
          </Card>
        </div>
      </div>
    </>
  );
}
