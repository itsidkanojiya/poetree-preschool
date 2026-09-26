import type { Prisma } from '@prisma/client';
import {
  GALLERY_PHOTO_MAX_BYTES,
  type AddGalleryPhotosInput,
  type CreateGalleryEventInput,
  type GalleryEventDetail,
  type GalleryEventSummary,
  type GalleryPhoto,
  type UpdateGalleryEventInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { assertCanReadStudent } from './scope.service.js';
import { writeAuditLog } from './audit.service.js';

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
} satisfies Prisma.GalleryEventInclude;

type EventRow = Prisma.GalleryEventGetPayload<{ include: typeof eventInclude }>;

function toPhoto(row: { id: string; fileId: string; caption: string | null }): GalleryPhoto {
  return { id: row.id, url: `/api/v1/files/${row.fileId}`, caption: row.caption };
}

function toDetail(row: EventRow): GalleryEventDetail {
  const photos = row.photos.map(toPhoto);
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
    cover: photos[0] ?? null,
    createdAt: row.createdAt.toISOString(),
    photos,
  };
}

function toSummary(row: EventRow): GalleryEventSummary {
  const { photos: _photos, ...summary } = toDetail(row);
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
    select: { id: true, name: true },
  });
  if (!existing) throw ApiError.notFound('Event not found');

  // The photo rows and class rows go with it; the files themselves stay, like
  // every other upload here — a deletion that reaches the disk is not undone.
  await prisma.galleryEvent.delete({ where: { id: eventId } });

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
    select: { id: true },
  });
  if (!photo) throw ApiError.notFound('Photo not found');
  await prisma.galleryPhoto.delete({ where: { id: photoId } });
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
    where: { ...where, photos: { some: {} } },
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
