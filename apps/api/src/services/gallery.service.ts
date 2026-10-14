import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  GALLERY_PHOTO_MAX_BYTES,
  GALLERY_THUMB_MAX_BYTES,
  youTubeVideoId,
  type AddGalleryPhotosInput,
  type AddGalleryVideoInput,
  type CreateGalleryEventInput,
  type GalleryEventDetail,
  type GalleryEventSummary,
  type GalleryPhoto,
  type GalleryVideo,
  type UpdateGalleryEventInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { stripImageMetadata } from '../lib/exif.js';
import { sniffMime, storage } from '../lib/storage.js';
import { assertCanReadStudent } from './scope.service.js';
import { writeAuditLog } from './audit.service.js';
import { driveFileName, putInSchoolDrive, trashInSchoolDrive } from './drive.service.js';

/**
 * The school's photographs, grouped by the occasion they were taken at.
 *
 * Everything here goes through the scoped client: a gallery is pictures of
 * children, and one school reading another's is the exact failure the tenant
 * filter exists to prevent.
 *
 * Who sees an event is decided by the office, class by class. A parent sees an
 * event only if it is open to the whole school or to the class their child is
 * in this year — and an event they cannot see is "not found", never
 * "forbidden", so the list of other classes' outings is not itself a leak.
 *
 * Where the bytes live is drive.service.ts's business: the school's own Google
 * Drive once it is connected, this server before that. Videos are not stored
 * at all — the school puts them on its own YouTube channel and the event keeps
 * the link.
 */

/** Only formats a phone can show without a plugin. */
const GALLERY_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const eventInclude = {
  classrooms: {
    select: {
      classroom: {
        select: { id: true, section: true, classLevel: { select: { name: true } } },
      },
    },
  },
  photos: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, fileId: true, caption: true },
  },
  videos: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, videoId: true, url: true, caption: true },
  },
} satisfies Prisma.GalleryEventInclude;

type EventRow = Prisma.GalleryEventGetPayload<{ include: typeof eventInclude }>;

function toPhoto(row: { id: string; fileId: string; caption: string | null }): GalleryPhoto {
  const url = `/api/v1/files/${row.fileId}`;
  return { id: row.id, url, thumbUrl: `${url}?variant=thumb`, caption: row.caption };
}

function toVideo(row: {
  id: string;
  videoId: string;
  url: string;
  caption: string | null;
}): GalleryVideo {
  return {
    id: row.id,
    videoId: row.videoId,
    url: row.url,
    thumbnailUrl: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
    caption: row.caption,
  };
}

function toDetail(row: EventRow): GalleryEventDetail {
  const photos = row.photos.map(toPhoto);
  const videos = row.videos.map(toVideo);
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate?.toISOString() ?? null,
    description: row.description,
    visibleToAll: row.visibleToAll,
    classrooms: row.classrooms.map(({ classroom }) => ({
      id: classroom.id,
      label: `${classroom.classLevel.name} — ${classroom.section}`,
    })),
    photoCount: photos.length,
    videoCount: videos.length,
    cover: photos[0] ?? null,
    coverVideo: videos[0] ?? null,
    createdAt: row.createdAt.toISOString(),
    photos,
    videos,
  };
}

function toSummary(row: EventRow): GalleryEventSummary {
  const { photos: _photos, videos: _videos, ...summary } = toDetail(row);
  return summary;
}

/** Newest occasion first; an undated one by when it was put up. */
const newestFirst = [
  { eventDate: { sort: 'desc' as const, nulls: 'last' as const } },
  { createdAt: 'desc' as const },
];

/** The classrooms must be this school's, which the scoped client settles. */
async function assertClassrooms(classroomIds: string[]): Promise<void> {
  if (classroomIds.length === 0) return;
  const found = await prisma.classroom.count({ where: { id: { in: classroomIds } } });
  if (found !== new Set(classroomIds).size) throw ApiError.notFound('Classroom not found');
}

/* -------------------------------------------------------------------------- */
/* The office                                                                 */
/* -------------------------------------------------------------------------- */

export async function listEvents(): Promise<GalleryEventSummary[]> {
  const rows = await prisma.galleryEvent.findMany({
    include: eventInclude,
    orderBy: newestFirst,
  });
  return rows.map(toSummary);
}

export async function getEvent(eventId: string): Promise<GalleryEventDetail> {
  const row = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    include: eventInclude,
  });
  if (!row) throw ApiError.notFound('Event not found');
  return toDetail(row);
}

export async function createEvent(
  input: CreateGalleryEventInput,
  actorUserId: string,
): Promise<GalleryEventDetail> {
  const schoolId = requireSchoolId();
  await assertClassrooms(input.classroomIds);

  const row = await prisma.galleryEvent.create({
    data: {
      schoolId,
      name: input.name,
      eventDate: input.eventDate ?? null,
      description: input.description ?? null,
      visibleToAll: input.visibleToAll,
      createdById: actorUserId,
      // Nested writes are not rewritten by the isolation extension, so the
      // school is stamped on each class row by hand.
      classrooms: {
        create: input.visibleToAll
          ? []
          : input.classroomIds.map((classroomId) => ({ classroomId, schoolId })),
      },
    },
    include: eventInclude,
  });

  await writeAuditLog({
    action: 'GALLERY_EVENT_CREATED',
    entity: 'GalleryEvent',
    entityId: row.id,
    schoolId,
    actorUserId,
    metadata: { name: row.name, visibleToAll: row.visibleToAll },
  });

  return toDetail(row);
}

export async function updateEvent(
  eventId: string,
  input: UpdateGalleryEventInput,
): Promise<GalleryEventDetail> {
  const schoolId = requireSchoolId();
  const existing = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    select: { id: true, visibleToAll: true },
  });
  if (!existing) throw ApiError.notFound('Event not found');

  if (input.classroomIds) await assertClassrooms(input.classroomIds);

  const visibleToAll = input.visibleToAll ?? existing.visibleToAll;
  const classroomIds = visibleToAll ? [] : input.classroomIds;

  if (!visibleToAll && classroomIds?.length === 0) {
    throw ApiError.badRequest(
      'Choose which classes can see it, or make it visible to the whole school',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.galleryEvent.update({
      where: { id: eventId },
      data: {
        name: input.name,
        eventDate: input.eventDate,
        description: input.description,
        visibleToAll: input.visibleToAll,
      },
    });

    // The class list is replaced whole rather than patched: a list of who may
    // see something is easier to get right written out than edited.
    if (classroomIds !== undefined) {
      await tx.galleryEventClassroom.deleteMany({ where: { eventId } });
      if (classroomIds.length > 0) {
        await tx.galleryEventClassroom.createMany({
          data: classroomIds.map((classroomId) => ({ eventId, classroomId, schoolId })),
        });
      }
    }
  });

  return getEvent(eventId);
}

export async function deleteEvent(eventId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const existing = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    select: { id: true, name: true, photos: { select: { fileId: true } } },
  });
  if (!existing) throw ApiError.notFound('Event not found');

  // The photo rows and class rows go with it. A file on this server stays,
  // like every other upload here — a deletion that reaches the disk is not
  // undone. One in the school's Drive goes to its bin, which is undone there.
  await prisma.galleryEvent.delete({ where: { id: eventId } });
  await releaseDriveFiles(existing.photos.map((photo) => photo.fileId));

  await writeAuditLog({
    action: 'GALLERY_EVENT_DELETED',
    entity: 'GalleryEvent',
    entityId: eventId,
    schoolId,
    actorUserId,
    metadata: { name: existing.name },
  });
}

/**
 * Files already uploaded, added to an event.
 *
 * Each one is checked here rather than trusted: it must be this school's, a
 * photograph, and no bigger than a megabyte. The portal shrinks a photo before
 * sending it, so a file over the limit means something went around the portal —
 * and the answer is to refuse it, not to store a 10 MB original that every
 * parent's phone then downloads.
 */
export async function addPhotos(
  eventId: string,
  input: AddGalleryPhotosInput,
): Promise<GalleryEventDetail> {
  const schoolId = requireSchoolId();
  const event = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    select: { id: true, photos: { select: { fileId: true, sortOrder: true } } },
  });
  if (!event) throw ApiError.notFound('Event not found');

  const fileIds = [...new Set(input.fileIds)];
  const files = await prisma.fileObject.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, mimeType: true, sizeBytes: true, originalName: true },
  });
  if (files.length !== fileIds.length) throw ApiError.notFound('File not found');

  for (const file of files) {
    if (!GALLERY_TYPES.has(file.mimeType)) {
      throw ApiError.badRequest(`${file.originalName} is not a photograph`);
    }
    if (file.sizeBytes > GALLERY_PHOTO_MAX_BYTES) {
      throw ApiError.badRequest(
        `${file.originalName} is larger than 1 MB. Upload it through the portal, which shrinks it first.`,
      );
    }
  }

  const already = new Set(event.photos.map((photo) => photo.fileId));
  let next = Math.max(0, ...event.photos.map((photo) => photo.sortOrder)) + 1;

  const fresh = fileIds.filter((id) => !already.has(id));
  if (fresh.length > 0) {
    await prisma.galleryPhoto.createMany({
      data: fresh.map((fileId) => ({ eventId, fileId, schoolId, sortOrder: next++ })),
    });
  }

  return getEvent(eventId);
}

export async function removePhoto(photoId: string): Promise<void> {
  const photo = await prisma.galleryPhoto.findFirst({
    where: { id: photoId },
    select: { id: true, fileId: true },
  });
  if (!photo) throw ApiError.notFound('Photo not found');
  await prisma.galleryPhoto.delete({ where: { id: photoId } });
  await releaseDriveFiles([photo.fileId]);
}

/**
 * Photos in the school's Drive that no event shows any more: to the Drive's
 * bin, where the school can still restore them for 30 days, and marked
 * deleted here so nothing serves them.
 */
async function releaseDriveFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const orphans = await prisma.fileObject.findMany({
    where: { id: { in: fileIds }, provider: 'GOOGLE_DRIVE', galleryPhotos: { none: {} } },
    select: { id: true, storageKey: true, thumbKey: true },
  });
  if (orphans.length === 0) return;

  await prisma.fileObject.updateMany({
    where: { id: { in: orphans.map((file) => file.id) } },
    data: { deletedAt: new Date() },
  });
  await trashInSchoolDrive(
    requireSchoolId(),
    orphans.flatMap((file) => [file.storageKey, ...(file.thumbKey ? [file.thumbKey] : [])]),
  );
}

/**
 * One photograph into an event, with the small copy the portal made of it
 * for grids — into the school's Google Drive when it has connected one.
 *
 * Checked here as every upload is: a photograph by its bytes rather than its
 * name, no bigger than the portal shrinks to, and stripped of anything the
 * camera wrote into it — for a school outing, where a group of children was.
 */
export async function uploadPhoto(
  eventId: string,
  input: { name: string; bytes: Buffer; thumb: Buffer | null },
  actorUserId: string,
): Promise<GalleryPhoto> {
  const schoolId = requireSchoolId();
  const event = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      photos: { orderBy: { sortOrder: 'desc' }, take: 1, select: { sortOrder: true } },
    },
  });
  if (!event) throw ApiError.notFound('Event not found');

  const mime = sniffMime(input.bytes);
  if (!mime || !GALLERY_TYPES.has(mime)) {
    throw ApiError.badRequest(`${input.name} is not a photograph`);
  }
  if (input.bytes.length > GALLERY_PHOTO_MAX_BYTES) {
    throw ApiError.badRequest(
      `${input.name} is larger than 1 MB. Upload it through the portal, which shrinks it first.`,
    );
  }

  let thumb: Buffer | null = null;
  if (input.thumb) {
    if (sniffMime(input.thumb) !== 'image/jpeg' || input.thumb.length > GALLERY_THUMB_MAX_BYTES) {
      throw ApiError.badRequest(`The small copy of ${input.name} is not a JPEG under 200 KB`);
    }
    thumb = stripImageMetadata(input.thumb, 'image/jpeg');
  }

  const bytes = stripImageMetadata(input.bytes, mime);
  const originalName = input.name.slice(0, 200);

  const inDrive = await putInSchoolDrive(schoolId, {
    name: driveFileName(event.name, originalName),
    mimeType: mime,
    bytes,
    thumb,
  });

  let location: {
    provider: 'LOCAL' | 'GOOGLE_DRIVE';
    storageKey: string;
    thumbKey: string | null;
  };
  if (inDrive) {
    location = { provider: 'GOOGLE_DRIVE', storageKey: inDrive.id, thumbKey: inDrive.thumbId };
  } else {
    const stored = await storage.put({ schoolId, originalName, bytes });
    const small = thumb
      ? await storage.put({ schoolId, originalName: 'thumb.jpg', bytes: thumb })
      : null;
    location = { provider: 'LOCAL', storageKey: stored.key, thumbKey: small?.key ?? null };
  }

  try {
    const photo = await prisma.$transaction(async (tx) => {
      const file = await tx.fileObject.create({
        data: {
          schoolId,
          ...location,
          originalName,
          mimeType: mime,
          sizeBytes: bytes.length,
          checksum: createHash('sha256').update(bytes).digest('hex'),
          uploadedById: actorUserId,
          visibility: 'SCHOOL',
        },
        select: { id: true },
      });
      return tx.galleryPhoto.create({
        data: {
          schoolId,
          eventId,
          fileId: file.id,
          sortOrder: (event.photos[0]?.sortOrder ?? 0) + 1,
        },
        select: { id: true, fileId: true, caption: true },
      });
    });
    return toPhoto(photo);
  } catch (error) {
    // The bytes were stored and the record was not: take them back out.
    if (inDrive) {
      await trashInSchoolDrive(schoolId, [
        inDrive.id,
        ...(inDrive.thumbId ? [inDrive.thumbId] : []),
      ]);
    } else {
      await storage.remove(location.storageKey);
      if (location.thumbKey) await storage.remove(location.thumbKey);
    }
    throw error;
  }
}

/** A video the school put on its own YouTube channel, by its link. */
export async function addVideo(
  eventId: string,
  input: AddGalleryVideoInput,
): Promise<GalleryVideo> {
  const schoolId = requireSchoolId();
  const event = await prisma.galleryEvent.findFirst({
    where: { id: eventId },
    select: { id: true, videos: { select: { videoId: true, sortOrder: true } } },
  });
  if (!event) throw ApiError.notFound('Event not found');

  const videoId = youTubeVideoId(input.url);
  if (!videoId) {
    throw ApiError.badRequest('Paste a YouTube link — youtube.com/watch?v=… or youtu.be/…');
  }

  // Compared here, exactly: YouTube ids are case-sensitive, the database's
  // comparison is not.
  if (event.videos.some((video) => video.videoId === videoId)) {
    throw ApiError.conflict('That video is already in this event');
  }

  const row = await prisma.galleryVideo.create({
    data: {
      schoolId,
      eventId,
      videoId,
      url: input.url,
      caption: input.caption ?? null,
      sortOrder: Math.max(0, ...event.videos.map((video) => video.sortOrder)) + 1,
    },
    select: { id: true, videoId: true, url: true, caption: true },
  });
  return toVideo(row);
}

/** Off the event. The video itself stays on the school's YouTube channel. */
export async function removeVideo(videoId: string): Promise<void> {
  const video = await prisma.galleryVideo.findFirst({
    where: { id: videoId },
    select: { id: true },
  });
  if (!video) throw ApiError.notFound('Video not found');
  await prisma.galleryVideo.delete({ where: { id: videoId } });
}

/* -------------------------------------------------------------------------- */
/* A family                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which events this child's family may see: the whole school's, and their own
 * class's this year. A child with no class this year sees only the whole
 * school's, which is the safe side to be wrong on.
 */
async function visibleTo(studentId: string): Promise<Prisma.GalleryEventWhereInput> {
  await assertCanReadStudent(studentId);

  const enrolment = await prisma.studentEnrolment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    orderBy: { enrolledOn: 'desc' },
    select: { classroomId: true },
  });

  return {
    OR: [
      { visibleToAll: true },
      ...(enrolment
        ? [{ classrooms: { some: { classroomId: enrolment.classroomId } } }]
        : []),
    ],
  };
}

export async function eventsForChild(studentId: string): Promise<GalleryEventSummary[]> {
  const where = await visibleTo(studentId);
  const rows = await prisma.galleryEvent.findMany({
    // An event with nothing in it yet is the office halfway through setting it
    // up, not something to show a family.
    where: { AND: [where, { OR: [{ photos: { some: {} } }, { videos: { some: {} } }] }] },
    include: eventInclude,
    orderBy: newestFirst,
  });
  return rows.map(toSummary);
}

export async function eventForChild(
  studentId: string,
  eventId: string,
): Promise<GalleryEventDetail> {
  const where = await visibleTo(studentId);
  const row = await prisma.galleryEvent.findFirst({
    where: { AND: [{ id: eventId }, where] },
    include: eventInclude,
  });
  if (!row) throw ApiError.notFound('Event not found');
  return toDetail(row);
}
